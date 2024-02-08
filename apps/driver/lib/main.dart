import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/api.dart';
import 'core/session.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  final prefs = await SharedPreferences.getInstance();
  final tokens = TokenStore();
  await tokens.load();
  runApp(ProviderScope(overrides: [prefsProvider.overrideWithValue(prefs), tokensProvider.overrideWithValue(tokens)], child: const RahaApp()));
}
