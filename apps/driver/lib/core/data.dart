import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'outbox.dart';
import 'session.dart';

Json asMap(dynamic v) => Map<String, dynamic>.from(v as Map);
List<Json> asList(dynamic v) => (v as List).map(asMap).toList();

Future<T> _guard<T>(Ref ref, Future<T> Function() f) async {
  try {
    return await f();
  } on ApiException catch (e) {
    if (e.status == 403 && (e.code == 'driver_profile_required' || e.code == 'not_a_driver' || e.message.toLowerCase().contains('driver'))) {
      Future.microtask(() => ref.read(sessionProvider.notifier).needsOnboarding());
    }
    rethrow;
  }
}

final homeProvider = FutureProvider.autoDispose<Json>((ref) => _guard(ref, () async => asMap(await ref.read(apiProvider).get('/driver/home'))));

final loadsProvider = FutureProvider.autoDispose.family<List<Json>, String>((ref, mode) async => asList(await ref.read(apiProvider).get('/driver/loads', query: {'mode': mode})));

final loadDetailProvider = FutureProvider.autoDispose.family<Json, String>((ref, id) async => asMap(await ref.read(apiProvider).get('/driver/loads/$id')));

final tripListProvider = FutureProvider.autoDispose.family<List<Json>, String>((ref, state) async {
  ref.watch(outboxProvider.select((s) => s.pending.length));
  return asList(await ref.read(apiProvider).get('/driver/trips', query: {'state': state}));
});

final earningsProvider = FutureProvider.autoDispose.family<Json, String>((ref, period) async => asMap(await ref.read(apiProvider).get('/driver/earnings', query: {'period': period})));
final profileProvider = FutureProvider.autoDispose<Json>((ref) async => asMap(await ref.read(apiProvider).get('/driver/profile')));
final vehicleProvider = FutureProvider.autoDispose<Json?>((ref) async {
  final r = await ref.read(apiProvider).get('/driver/vehicle');
  return r == null || r == '' ? null : asMap(r);
});
final returnLoadsProvider = FutureProvider.autoDispose<Json>((ref) async => asMap(await ref.read(apiProvider).get('/driver/return-loads')));
final notificationsProvider = FutureProvider.autoDispose<Json>((ref) async => asMap(await ref.read(apiProvider).get('/notifications')));

/// Trip detail: server truth, with the last good copy as an offline fallback and queued actions applied on top.
final tripProvider = FutureProvider.autoDispose.family<Json, String>((ref, id) async {
  final pending = ref.watch(outboxProvider.select((s) => s.pending)).where((a) => a.tripId == id).toList();
  ref.watch(outboxProvider.select((s) => s.pending.length));
  final prefs = ref.read(prefsProvider);
  Json trip;
  try {
    trip = asMap(await ref.read(apiProvider).get('/driver/trips/$id'));
    prefs.setString('trip.$id', jsonEncode(trip));
  } on ApiException catch (e) {
    final cached = prefs.getString('trip.$id');
    if (!e.offline || cached == null) rethrow;
    trip = asMap(jsonDecode(cached));
  }
  return pending.isEmpty ? trip : patchTrip(trip, pending);
});

/// Mirrors what the server will do with the queued actions so the screen moves on without signal.
Json patchTrip(Json src, List<QueuedAction> actions) {
  final t = asMap(jsonDecode(jsonEncode(src)));
  final loads = (t['loads'] as List).map(asMap).toList();
  t['loads'] = loads;
  for (final a in actions) {
    Json? load() {
      for (final l in loads) {
        if (l['loadId'] == a.loadId) return l;
      }
      return null;
    }

    switch (a.type) {
      case 'begin':
        if (t['status'] == 'planned') t['status'] = 'to_pickup';
      case 'arrive':
        load()?['status'] = 'arrived_pickup';
      case 'pickup':
        load()?['status'] = 'picked_up';
      case 'start':
        t['status'] = 'in_transit';
        for (final l in loads) {
          if (l['status'] == 'picked_up') l['status'] = 'in_transit';
        }
      case 'checkin':
        (t['checkins'] as List).add({'placeId': a.payload['placeId'], 'placeName': a.payload['placeName'] ?? '', 'at': a.at, 'channel': 'app', 'offline': true});
      case 'deliver':
        load()
          ?..['status'] = 'delivered'
          ..['deliveredAt'] = a.at;
    }
  }
  if (loads.isNotEmpty && loads.every((l) => l['status'] == 'delivered')) t['status'] = 'completed';
  t['offlinePatched'] = true;
  return t;
}

/// 1 pickup · 2 load · 3 depart · 4 road · 5 deliver · 6 complete — derived from load statuses so it works offline.
int tripStep(Json t) {
  final loads = (t['loads'] as List).map(asMap).toList();
  if (loads.isEmpty || t['status'] == 'completed' || loads.every((l) => l['status'] == 'delivered')) return 6;
  final live = loads.where((l) => l['status'] != 'delivered' && l['status'] != 'failed').toList();
  if (live.any((l) => l['status'] == 'in_transit')) return 4;
  if (live.any((l) => l['status'] == 'arrived_pickup')) return 2;
  if (live.every((l) => l['status'] == 'picked_up')) return 3;
  return 1;
}

class TripActions {
  TripActions(this.ref);
  final Ref ref;

  Future<void> _do(String type, String tripId, {String? loadId, Json payload = const {}, List<String> photos = const []}) async {
    final a = QueuedAction(id: newId(), type: type, tripId: tripId, loadId: loadId, at: DateTime.now().toUtc().toIso8601String(), payload: payload, photos: photos);
    final box = ref.read(outboxProvider.notifier);
    await box.add(a);
    final rejected = ref.read(outboxProvider).failed.where((f) => f.id == a.id);
    if (rejected.isNotEmpty) {
      final msg = rejected.first.error ?? 'Rejected';
      box.dismissFailed();
      throw ApiException(msg);
    }
  }

  Future<void> begin(String tripId) => _do('begin', tripId);
  Future<void> arrive(String tripId, String loadId) => _do('arrive', tripId, loadId: loadId);
  Future<void> pickup(String tripId, String loadId, {required bool counted, required bool noDamage, required bool waybill, required List<String> photos}) =>
      _do('pickup', tripId, loadId: loadId, payload: {'checklist': {'counted': counted, 'noDamage': noDamage, 'waybill': waybill}}, photos: photos);
  Future<void> start(String tripId) => _do('start', tripId);
  Future<void> checkin(String tripId, String placeId, String placeName) => _do('checkin', tripId, payload: {'placeId': placeId, 'placeName': placeName, 'clientId': newId()});
  Future<void> deliver(String tripId, String loadId, {required String pin, required String condition, int? receivedCount, String? photo}) =>
      _do('deliver', tripId, loadId: loadId, payload: {'pin': pin, 'condition': condition, if (receivedCount != null) 'receivedCount': receivedCount, 'offline': !ref.read(outboxProvider).online}, photos: photo == null ? const [] : [photo]);
}

final tripActionsProvider = Provider<TripActions>(TripActions.new);
