import 'dart:convert';
import 'dart:io' show File;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import 'api.dart';
import 'session.dart';

const _uuid = Uuid();
String newId() => _uuid.v4();

/// sha256("salt:pin") — the phone checks the receiver's PIN against this with no signal.
bool pinMatches(String salt, String digest, String pin) => sha256.convert(utf8.encode('$salt:$pin')).toString() == digest;

/// Photos are compressed by the camera plugin (~80 KB). On Android they are copied into app storage so they
/// survive until the queue is flushed; on web they are uploaded right away.
Future<String?> capturePhoto(Api api, {bool selfie = false}) async {
  final x = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 1280, maxHeight: 1280, imageQuality: 55, preferredCameraDevice: selfie ? CameraDevice.front : CameraDevice.rear);
  if (x == null) return null;
  if (kIsWeb) return 'key:${await api.upload(await x.readAsBytes(), 'photo.jpg')}';
  final dir = await getApplicationDocumentsDirectory();
  final dest = '${dir.path}/ph_${newId()}.jpg';
  await File(x.path).copy(dest);
  return 'file:$dest';
}

class QueuedAction {
  QueuedAction({required this.id, required this.type, required this.tripId, this.loadId, required this.at, required this.payload, this.photos = const [], this.error});
  final String id, type, tripId, at;
  final String? loadId;
  final Json payload;

  /// Local photo refs ("file:/…" or "key:…") to upload before sending; filled into `photoKeys` / `photoKey`.
  final List<String> photos;
  String? error;

  Json toJson() => {'id': id, 'type': type, 'tripId': tripId, 'loadId': loadId, 'at': at, 'payload': payload, 'photos': photos, 'error': error};
  static QueuedAction fromJson(Json j) => QueuedAction(id: j['id'], type: j['type'], tripId: j['tripId'], loadId: j['loadId'], at: j['at'], payload: Map<String, dynamic>.from(j['payload']), photos: List<String>.from(j['photos'] ?? const []), error: j['error']);
}

class OutboxState {
  const OutboxState({this.pending = const [], this.failed = const [], this.syncing = false, this.online = true});
  final List<QueuedAction> pending, failed;
  final bool syncing, online;
  OutboxState copy({List<QueuedAction>? pending, List<QueuedAction>? failed, bool? syncing, bool? online}) => OutboxState(pending: pending ?? this.pending, failed: failed ?? this.failed, syncing: syncing ?? this.syncing, online: online ?? this.online);
}

/// Offline-first queue: every trip action is written here first, then flushed through POST /driver/sync.
/// The server applies actions idempotently by id, so retries are safe.
class OutboxNotifier extends Notifier<OutboxState> {
  static const _k = 'outbox.v1';
  static const _kf = 'outbox.failed.v1';
  bool _flushing = false;

  @override
  OutboxState build() {
    final p = ref.read(prefsProvider);
    List<QueuedAction> read(String k) => (p.getStringList(k) ?? const []).map((s) => QueuedAction.fromJson(jsonDecode(s) as Json)).toList();
    final sub = Connectivity().onConnectivityChanged.listen((r) {
      final on = !r.contains(ConnectivityResult.none);
      state = state.copy(online: on);
      if (on) flush();
    });
    ref.onDispose(sub.cancel);
    Future.microtask(flush);
    return OutboxState(pending: read(_k), failed: read(_kf));
  }

  void _save() {
    final p = ref.read(prefsProvider);
    p.setStringList(_k, state.pending.map((a) => jsonEncode(a.toJson())).toList());
    p.setStringList(_kf, state.failed.map((a) => jsonEncode(a.toJson())).toList());
  }

  Future<void> add(QueuedAction a) async {
    state = state.copy(pending: [...state.pending, a]);
    _save();
    await flush();
  }

  void dismissFailed() {
    state = state.copy(failed: []);
    _save();
  }

  Future<String> _uploadRef(String r) async {
    if (r.startsWith('key:')) return r.substring(4);
    final path = r.substring(5);
    final key = await ref.read(apiProvider).upload(await File(path).readAsBytes(), 'photo.jpg');
    try {
      await File(path).delete();
    } catch (_) {}
    return key;
  }

  /// Sends everything queued. Returns true when the queue is empty afterwards.
  Future<bool> flush() async {
    if (_flushing || state.pending.isEmpty) return state.pending.isEmpty;
    _flushing = true;
    state = state.copy(syncing: true);
    try {
      final batch = <QueuedAction>[];
      final bodies = <Json>[];
      for (final a in state.pending.take(50)) {
        final payload = Map<String, dynamic>.from(a.payload);
        if (a.photos.isNotEmpty) {
          final keys = [for (final p in a.photos) await _uploadRef(p)];
          if (a.type == 'deliver') {
            payload['photoKey'] = keys.first;
          } else {
            payload['photoKeys'] = keys;
          }
        }
        batch.add(a);
        bodies.add({'id': a.id, 'type': a.type, 'tripId': a.tripId, if (a.loadId != null) 'loadId': a.loadId, 'at': a.at, 'payload': payload});
      }
      final r = await ref.read(apiProvider).post('/driver/sync', {'actions': bodies}) as Map;
      final results = {for (final x in (r['results'] as List)) (x as Map)['id'] as String: x};
      final failed = [...state.failed];
      for (final a in batch) {
        final res = results[a.id];
        if (res != null && res['ok'] != true) {
          a.error = ((res['error'] as Map?)?['message'] as String?) ?? 'Rejected';
          failed.add(a);
        }
      }
      final done = batch.map((a) => a.id).toSet();
      state = state.copy(pending: state.pending.where((a) => !done.contains(a.id)).toList(), failed: failed, online: true);
      _save();
    } on ApiException catch (e) {
      if (e.offline) state = state.copy(online: false);
    } catch (_) {
      // Photo file missing or similar: keep the queue and try again later.
    } finally {
      _flushing = false;
      state = state.copy(syncing: false);
    }
    return state.pending.isEmpty;
  }
}

final outboxProvider = NotifierProvider<OutboxNotifier, OutboxState>(OutboxNotifier.new);
