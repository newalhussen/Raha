import 'package:intl/intl.dart';

final _n = NumberFormat.decimalPattern();

String etb(num v) => '${_n.format(v.round())} ETB';
String kg(num v) => v >= 1000 ? '${(v / 1000).toStringAsFixed(v % 1000 == 0 ? 0 : 1)} t' : '${_n.format(v)} kg';
String num0(num v) => _n.format(v);

DateTime? parseT(dynamic v) => v == null ? null : DateTime.tryParse(v as String)?.toLocal();

String when(dynamic v) {
  final d = parseT(v);
  if (d == null) return '—';
  final now = DateTime.now();
  final t = DateFormat('HH:mm').format(d);
  final day = DateTime(d.year, d.month, d.day).difference(DateTime(now.year, now.month, now.day)).inDays;
  if (day == 0) return 'Today $t';
  if (day == 1) return 'Tomorrow $t';
  if (day == -1) return 'Yesterday $t';
  return '${DateFormat('d MMM').format(d)} $t';
}

String hm(dynamic v) {
  final d = parseT(v);
  return d == null ? '—' : DateFormat('HH:mm').format(d);
}

String placeName(Map<String, dynamic>? p, bool am) => p == null ? '' : (am ? (p['nameAm'] as String?) ?? p['name'] as String : p['name'] as String);

/// 0911 204 418 style for display.
String phone(String? p) {
  if (p == null) return '';
  final d = p.replaceAll(RegExp(r'\D'), '');
  if (d.startsWith('251') && d.length == 12) return '0${d.substring(3, 6)} ${d.substring(6, 9)} ${d.substring(9)}';
  return p;
}

/// Accepts 0911…, 911…, +251911… and returns +251911… (or null when it cannot be a mobile number).
String? normalizePhone(String raw) {
  var d = raw.replaceAll(RegExp(r'[^\d+]'), '');
  if (d.startsWith('+')) d = d.substring(1);
  if (d.startsWith('251')) d = d.substring(3);
  if (d.startsWith('0')) d = d.substring(1);
  return RegExp(r'^[79]\d{8}$').hasMatch(d) ? '+251$d' : null;
}
