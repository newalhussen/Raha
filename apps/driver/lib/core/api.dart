import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Override with `--dart-define=API_URL=http://192.168.1.20:4000` for a phone on the same Wi-Fi.
const _envUrl = String.fromEnvironment('API_URL');

String get apiBase {
  if (_envUrl.isNotEmpty) return '$_envUrl/api/v1';
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) return 'http://10.0.2.2:4000/api/v1';
  return 'http://localhost:4000/api/v1';
}

typedef Json = Map<String, dynamic>;

class ApiException implements Exception {
  ApiException(this.message, {this.code, this.status, this.offline = false});
  final String message;
  final String? code;
  final int? status;

  /// No connection / timeout — the caller may queue the work and retry.
  final bool offline;
  @override
  String toString() => message;
}

class TokenStore {
  TokenStore() : _s = const FlutterSecureStorage();
  final FlutterSecureStorage _s;
  String? access, refresh;

  Future<void> load() async {
    access = await _s.read(key: 'at');
    refresh = await _s.read(key: 'rt');
  }

  Future<void> save(String a, String r) async {
    access = a;
    refresh = r;
    await _s.write(key: 'at', value: a);
    await _s.write(key: 'rt', value: r);
  }

  Future<void> clear() async {
    access = refresh = null;
    await _s.delete(key: 'at');
    await _s.delete(key: 'rt');
  }
}

class Api {
  Api(this.tokens, {this.onSignedOut}) {
    dio = Dio(BaseOptions(baseUrl: apiBase, connectTimeout: const Duration(seconds: 12), receiveTimeout: const Duration(seconds: 20), sendTimeout: const Duration(seconds: 30)));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (o, h) {
        if (tokens.access != null && o.extra['auth'] != false) o.headers['Authorization'] = 'Bearer ${tokens.access}';
        h.next(o);
      },
      onError: (e, h) async {
        if (e.response?.statusCode == 401 && e.requestOptions.extra['auth'] != false && e.requestOptions.extra['retried'] != true && tokens.refresh != null) {
          if (await _refresh()) {
            final o = e.requestOptions..extra['retried'] = true;
            o.headers['Authorization'] = 'Bearer ${tokens.access}';
            try {
              return h.resolve(await dio.fetch(o));
            } on DioException catch (e2) {
              return h.next(e2);
            }
          }
          onSignedOut?.call();
        }
        h.next(e);
      },
    ));
  }

  final TokenStore tokens;
  final void Function()? onSignedOut;
  late final Dio dio;
  Future<bool>? _refreshing;

  Future<bool> _refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<bool> _doRefresh() async {
    try {
      final r = await dio.post('/auth/refresh', data: {'refreshToken': tokens.refresh}, options: Options(extra: {'auth': false}));
      await tokens.save(r.data['accessToken'] as String, r.data['refreshToken'] as String);
      return true;
    } catch (_) {
      return false;
    }
  }

  ApiException _wrap(DioException e) {
    final d = e.response?.data;
    if (d is Map && d['message'] != null) {
      final m = d['message'];
      return ApiException(m is List ? m.join(', ') : '$m', code: d['code'] as String?, status: e.response?.statusCode);
    }
    final offline = e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout || e.type == DioExceptionType.receiveTimeout || e.type == DioExceptionType.sendTimeout || e.response == null;
    return ApiException(offline ? 'No connection' : 'Something went wrong', status: e.response?.statusCode, offline: offline);
  }

  Future<T> _run<T>(Future<Response<dynamic>> Function() f) async {
    try {
      final r = await f();
      return r.data as T;
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }

  Future<dynamic> get(String p, {Json? query}) => _run<dynamic>(() => dio.get(p, queryParameters: query));
  Future<dynamic> post(String p, [Object? body, bool auth = true]) => _run<dynamic>(() => dio.post(p, data: body ?? const {}, options: Options(extra: {'auth': auth})));
  Future<dynamic> put(String p, Object body) => _run<dynamic>(() => dio.put(p, data: body));
  Future<dynamic> patch(String p, Object body) => _run<dynamic>(() => dio.patch(p, data: body));

  /// Uploads one compressed photo; returns the storage key.
  Future<String> upload(List<int> bytes, String name) async {
    final form = FormData.fromMap({'file': MultipartFile.fromBytes(bytes, filename: name, contentType: DioMediaType('image', 'jpeg'))});
    final r = await _run<dynamic>(() => dio.post('/uploads', data: form));
    return (r as Map)['key'] as String;
  }
}
