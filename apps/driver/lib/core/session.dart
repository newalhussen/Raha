import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';

final prefsProvider = Provider<SharedPreferences>((_) => throw UnimplementedError('prefs not loaded'));
final tokensProvider = Provider<TokenStore>((_) => throw UnimplementedError('tokens not loaded'));

final apiProvider = Provider<Api>((ref) => Api(ref.read(tokensProvider), onSignedOut: () => ref.read(sessionProvider.notifier).signedOut()));

enum AuthStatus { out, needsProfile, ready }

class Auth {
  const Auth(this.status, {this.name = ''});
  final AuthStatus status;
  final String name;
}

class SessionNotifier extends Notifier<Auth> {
  @override
  Auth build() {
    final t = ref.read(tokensProvider);
    // Optimistic: a stored token means "ready"; the first API call corrects it (401 -> signedOut, 403 -> onboarding).
    return Auth(t.access != null ? AuthStatus.ready : AuthStatus.out, name: ref.read(prefsProvider).getString('name') ?? '');
  }

  Future<Json> requestOtp(String phone) async => Map<String, dynamic>.from(await ref.read(apiProvider).post('/auth/otp/request', {'phone': phone, 'app': 'driver'}, false) as Map);

  Future<void> verify(String phone, String code) async {
    final r = Map<String, dynamic>.from(await ref.read(apiProvider).post('/auth/otp/verify', {'phone': phone, 'code': code, 'app': 'driver', 'deviceName': 'Raha Driver'}, false) as Map);
    final tk = r['tokens'] as Map;
    await ref.read(tokensProvider).save(tk['accessToken'] as String, tk['refreshToken'] as String);
    final name = ((r['user'] as Map)['fullName'] as String?) ?? '';
    await ref.read(prefsProvider).setString('name', name);
    state = Auth(r['needsProfile'] == true ? AuthStatus.needsProfile : AuthStatus.ready, name: name);
  }

  Future<void> onboard(String fullName, {String? licenceNumber, String? licenceGrade}) async {
    await ref.read(apiProvider).post('/driver/onboard', {'fullName': fullName, if (licenceNumber != null && licenceNumber.isNotEmpty) 'licenceNumber': licenceNumber, if (licenceGrade != null && licenceGrade.isNotEmpty) 'licenceGrade': licenceGrade});
    await ref.read(prefsProvider).setString('name', fullName);
    state = Auth(AuthStatus.ready, name: fullName);
  }

  void needsOnboarding() => state = Auth(AuthStatus.needsProfile, name: state.name);

  Future<void> logout() async {
    final t = ref.read(tokensProvider);
    final rt = t.refresh;
    if (rt != null) {
      try {
        await ref.read(apiProvider).post('/auth/logout', {'refreshToken': rt}, false);
      } catch (_) {}
    }
    signedOut();
  }

  void signedOut() {
    ref.read(tokensProvider).clear();
    state = const Auth(AuthStatus.out);
  }
}

final sessionProvider = NotifierProvider<SessionNotifier, Auth>(SessionNotifier.new);
