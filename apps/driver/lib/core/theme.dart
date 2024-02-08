import 'package:flutter/material.dart';

/// Raha — "Basalt & Signal Amber". Square corners, big targets, no custom fonts (low-end friendly).
class C {
  static const basalt = Color(0xFF15141A);
  static const night = Color(0xFF0F0E13);
  static const graphite = Color(0xFF24232B);
  static const graphite3 = Color(0xFF34333C);
  static const amber = Color(0xFFF2A516);
  static const amberHover = Color(0xFFE09A0D);
  static const amberTint = Color(0xFFFCEAC4);
  static const amberInk = Color(0xFF8A5A00);
  static const bone = Color(0xFFF4F1EA);
  static const paper = Color(0xFFFBFAF7);
  static const sand = Color(0xFFEDEAE2);
  static const line = Color(0xFFE3DED3);
  static const lineStrong = Color(0xFFC9C4B8);
  static const muted = Color(0xFF6B675F);
  static const stone = Color(0xFF9A968C);
  static const lapis = Color(0xFF3346B8);
  static const lapisTint = Color(0xFFE3E6F7);
  static const green = Color(0xFF2F7A55);
  static const greenTint = Color(0xFFE2EFE7);
  static const red = Color(0xFFB4410E);
  static const redTint = Color(0xFFF6E2D8);
}

const kMono = TextStyle(fontFamily: 'monospace', fontFeatures: [FontFeature.tabularFigures()]);

ThemeData buildTheme() {
  const shape = RoundedRectangleBorder(borderRadius: BorderRadius.zero);
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: C.amber, brightness: Brightness.light).copyWith(
      primary: C.amber,
      onPrimary: C.basalt,
      surface: C.paper,
      onSurface: C.basalt,
      error: C.red,
      outline: C.line,
    ),
    scaffoldBackgroundColor: C.bone,
    splashFactory: InkRipple.splashFactory,
  );
  return base.copyWith(
    appBarTheme: const AppBarTheme(backgroundColor: C.basalt, foregroundColor: C.bone, elevation: 0, centerTitle: false, titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: C.bone)),
    cardTheme: const CardThemeData(color: C.paper, elevation: 0, margin: EdgeInsets.zero, shape: RoundedRectangleBorder(side: BorderSide(color: C.line), borderRadius: BorderRadius.zero)),
    dividerTheme: const DividerThemeData(color: C.line, space: 1, thickness: 1),
    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.zero, borderSide: BorderSide(color: C.lineStrong)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.zero, borderSide: BorderSide(color: C.lineStrong)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.zero, borderSide: BorderSide(color: C.amber, width: 2)),
    ),
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(backgroundColor: C.amber, foregroundColor: C.basalt, minimumSize: const Size(64, 56), shape: shape, textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800))),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(foregroundColor: C.basalt, minimumSize: const Size(64, 56), shape: shape, side: const BorderSide(color: C.basalt, width: 1.5), textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700))),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: C.basalt, minimumSize: const Size(56, 56), shape: shape)),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: C.basalt,
      height: 68,
      indicatorColor: C.graphite3,
      indicatorShape: shape,
      labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: s.contains(WidgetState.selected) ? C.amber : C.stone)),
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? C.amber : C.stone)),
    ),
    snackBarTheme: const SnackBarThemeData(backgroundColor: C.basalt, contentTextStyle: TextStyle(color: C.bone, fontWeight: FontWeight.w600), behavior: SnackBarBehavior.floating, shape: shape),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? C.basalt : C.stone),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? C.amber : C.sand),
      trackOutlineColor: WidgetStateProperty.all(C.lineStrong),
    ),
  );
}
