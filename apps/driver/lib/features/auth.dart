import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/fmt.dart';
import '../core/i18n.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../core/widgets.dart';

class _AuthFrame extends ConsumerWidget {
  const _AuthFrame({required this.title, required this.children});
  final String title;
  final List<Widget> children;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
        backgroundColor: C.basalt,
        body: SafeArea(
          child: ListView(padding: const EdgeInsets.all(24), children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Row(children: [
                Container(width: 34, height: 34, color: C.amber, alignment: Alignment.center, child: const Text('R', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 22, color: C.basalt))),
                const SizedBox(width: 10),
                const Text('RAHA', style: TextStyle(color: C.bone, fontWeight: FontWeight.w900, fontSize: 20, letterSpacing: 2)),
                const SizedBox(width: 8),
                const Kicker('Driver', color: C.stone),
              ]),
              const LangToggle(),
            ]),
            const SizedBox(height: 56),
            Text(ref.t(title), style: const TextStyle(color: C.bone, fontSize: 30, fontWeight: FontWeight.w900, height: 1.1)),
            const SizedBox(height: 28),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
          ]),
        ),
      );
}

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginState();
}

class _LoginState extends ConsumerState<LoginScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  String? _normalized;
  String? _dev;
  bool _busy = false;
  String? _err;

  Future<void> _send() async {
    final n = normalizePhone(_phone.text);
    if (n == null) {
      setState(() => _err = 'Enter a valid Ethiopian mobile number, e.g. 0911 204 418');
      return;
    }
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      final r = await ref.read(sessionProvider.notifier).requestOtp(n);
      setState(() {
        _normalized = n;
        _dev = r['devCode'] as String?;
        _code.text = _dev ?? '';
      });
    } catch (e) {
      setState(() => _err = errText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      await ref.read(sessionProvider.notifier).verify(_normalized!, _code.text.trim());
    } catch (e) {
      if (mounted) setState(() => _err = errText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final step2 = _normalized != null;
    const dark = TextStyle(color: C.basalt, fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: 1);
    return _AuthFrame(title: step2 ? 'Enter the 6-digit code' : 'Enter your phone number', children: [
      if (!step2) ...[
        TextField(controller: _phone, keyboardType: TextInputType.phone, autofocus: true, style: dark, decoration: InputDecoration(hintText: '09XX XXX XXX', prefixText: '+251  ', prefixStyle: dark.copyWith(color: C.muted), labelText: ref.t('Phone number')), onSubmitted: (_) => _send()),
        if (_err != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_err!, style: const TextStyle(color: Color(0xFFFFB38F), fontWeight: FontWeight.w600))),
        const SizedBox(height: 20),
        BigButton(ref.t('Send code'), busy: _busy, onPressed: _send),
      ] else ...[
        Text('+251 ${_normalized!.substring(4)}', style: const TextStyle(color: C.stone, fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        TextField(controller: _code, keyboardType: TextInputType.number, inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)], autofocus: true, textAlign: TextAlign.center, style: dark.copyWith(fontSize: 30, letterSpacing: 10), onChanged: (v) => v.length == 6 ? _verify() : null),
        if (_dev != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Dev code: $_dev', style: const TextStyle(color: C.amber, fontSize: 12, fontWeight: FontWeight.w700))),
        if (_err != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_err!, style: const TextStyle(color: Color(0xFFFFB38F), fontWeight: FontWeight.w600))),
        const SizedBox(height: 20),
        BigButton(ref.t('Sign in'), busy: _busy, onPressed: _code.text.length == 6 ? _verify : null),
        TextButton(onPressed: () => setState(() => _normalized = null), child: Text(ref.t('Resend code'), style: const TextStyle(color: C.stone))),
      ],
    ]);
  }
}

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});
  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardState();
}

class _OnboardState extends ConsumerState<OnboardingScreen> {
  final _name = TextEditingController();
  final _lic = TextEditingController();
  final _grade = TextEditingController();
  bool _busy = false;
  String? _err;

  Future<void> _go() async {
    if (_name.text.trim().length < 2) {
      setState(() => _err = 'Enter your full name');
      return;
    }
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      await ref.read(sessionProvider.notifier).onboard(_name.text.trim(), licenceNumber: _lic.text.trim(), licenceGrade: _grade.text.trim());
    } catch (e) {
      if (mounted) setState(() => _err = errText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => _AuthFrame(title: 'Welcome to Raha', children: [
        TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: ref.t('Full name'))),
        const SizedBox(height: 14),
        TextField(controller: _lic, textCapitalization: TextCapitalization.characters, decoration: InputDecoration(labelText: ref.t('Licence number'))),
        const SizedBox(height: 14),
        TextField(controller: _grade, textCapitalization: TextCapitalization.characters, decoration: InputDecoration(labelText: ref.t('Licence grade'))),
        if (_err != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_err!, style: const TextStyle(color: Color(0xFFFFB38F), fontWeight: FontWeight.w600))),
        const SizedBox(height: 24),
        BigButton(ref.t('Continue'), busy: _busy, onPressed: _go),
        const SizedBox(height: 10),
        TextButton(onPressed: ref.read(sessionProvider.notifier).logout, child: Text(ref.t('Sign out'), style: const TextStyle(color: C.stone))),
      ]);
}
