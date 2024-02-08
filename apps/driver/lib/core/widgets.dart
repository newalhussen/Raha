import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'fmt.dart';
import 'i18n.dart';
import 'outbox.dart';
import 'theme.dart';

/// The one primary action on a screen: 64 px, amber, full width.
class BigButton extends StatelessWidget {
  const BigButton(this.label, {super.key, required this.onPressed, this.busy = false, this.icon, this.dark = false});
  final String label;
  final VoidCallback? onPressed;
  final bool busy, dark;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => SizedBox(
        height: 64,
        width: double.infinity,
        child: FilledButton(
          style: dark ? FilledButton.styleFrom(backgroundColor: C.basalt, foregroundColor: C.bone) : null,
          onPressed: busy ? null : onPressed,
          child: busy
              ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 3, color: C.basalt))
              : Row(mainAxisAlignment: MainAxisAlignment.center, children: [if (icon != null) ...[Icon(icon, size: 22), const SizedBox(width: 10)], Flexible(child: Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 17)))]),
        ),
      );
}

class Kicker extends StatelessWidget {
  const Kicker(this.text, {super.key, this.color = C.muted});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Text(text.toUpperCase(), style: TextStyle(fontSize: 11, letterSpacing: 1.2, fontWeight: FontWeight.w800, color: color));
}

class Box extends StatelessWidget {
  const Box({super.key, required this.child, this.pad = 16, this.dark = false, this.onTap, this.border});
  final Widget child;
  final double pad;
  final bool dark;
  final VoidCallback? onTap;
  final Color? border;
  @override
  Widget build(BuildContext context) => Material(
        color: dark ? C.basalt : C.paper,
        shape: RoundedRectangleBorder(side: BorderSide(color: border ?? (dark ? C.basalt : C.line))),
        child: InkWell(onTap: onTap, child: Padding(padding: EdgeInsets.all(pad), child: child)),
      );
}

enum Tone { neutral, amber, green, red, lapis, dark }

class Tag extends StatelessWidget {
  const Tag(this.text, {super.key, this.tone = Tone.neutral});
  final String text;
  final Tone tone;
  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (tone) {
      Tone.amber => (C.amberTint, C.amberInk),
      Tone.green => (C.greenTint, C.green),
      Tone.red => (C.redTint, C.red),
      Tone.lapis => (C.lapisTint, C.lapis),
      Tone.dark => (C.basalt, C.amber),
      _ => (C.sand, C.muted),
    };
    return Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), color: bg, child: Text(text.toUpperCase(), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: fg)));
  }
}

Tone toneOf(String? t) => switch (t) { 'amber' => Tone.amber, 'green' => Tone.green, 'lapis' => Tone.lapis, 'red' => Tone.red, _ => Tone.neutral };

/// Truck capacity: basalt = aboard, amber = Raha match, hatched = free.
class CapBar extends StatelessWidget {
  const CapBar(this.bar, {super.key, this.height = 22});
  final Map<String, dynamic> bar;
  final double height;
  @override
  Widget build(BuildContext context) {
    final total = ((bar['totalKg'] as num?) ?? 1).toDouble().clamp(1, double.infinity);
    final ink = ((bar['inkKg'] as num?) ?? 0).toDouble(), amber = ((bar['amberKg'] as num?) ?? 0).toDouble();
    final free = (total - ink - amber).clamp(0, total).toDouble();
    Widget seg(double v, Widget w) => v <= 0 ? const SizedBox.shrink() : Expanded(flex: (v / total * 1000).round().clamp(1, 1000), child: w);
    return Container(
      height: height,
      decoration: BoxDecoration(border: Border.all(color: C.basalt, width: 1.5)),
      child: Row(children: [seg(ink, Container(color: C.basalt)), seg(amber, Container(color: C.amber)), seg(free, CustomPaint(painter: _Hatch(), child: const SizedBox.expand()))]),
    );
  }
}

class _Hatch extends CustomPainter {
  @override
  void paint(Canvas c, Size s) {
    final p = Paint()..color = C.lineStrong..strokeWidth = 1;
    c.clipRect(Offset.zero & s);
    for (double x = -s.height; x < s.width; x += 7) {
      c.drawLine(Offset(x, s.height), Offset(x + s.height, 0), p);
    }
  }

  @override
  bool shouldRepaint(_) => false;
}

class CapLegend extends StatelessWidget {
  const CapLegend(this.bar, {super.key});
  final Map<String, dynamic> bar;
  @override
  Widget build(BuildContext context) {
    Widget it(Color c, String t, {bool hatch = false}) => Row(mainAxisSize: MainAxisSize.min, children: [Container(width: 10, height: 10, decoration: BoxDecoration(color: hatch ? null : c, border: Border.all(color: C.basalt))), const SizedBox(width: 5), Text(t, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600))]);
    return Wrap(spacing: 14, runSpacing: 4, children: [
      it(C.basalt, '${kg(bar['inkKg'] ?? 0)} aboard'),
      if (((bar['amberKg'] as num?) ?? 0) > 0) it(C.amber, '${kg(bar['amberKg'])} Raha'),
      it(C.line, '${kg(bar['freeKg'] ?? 0)} free', hatch: true),
    ]);
  }
}

/// Vertical corridor strip: where the truck has been and what is next.
class Strip extends StatelessWidget {
  const Strip(this.strip, {super.key, required this.am});
  final Map<String, dynamic> strip;
  final bool am;
  @override
  Widget build(BuildContext context) {
    final stops = (strip['stops'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    return Column(children: [
      for (var i = 0; i < stops.length; i++)
        IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            SizedBox(
              width: 26,
              child: Column(children: [
                Container(width: 2, height: 6, color: i == 0 ? Colors.transparent : C.basalt),
                _dot(stops[i]['state'] as String),
                Expanded(child: Container(width: 2, color: i == stops.length - 1 ? Colors.transparent : (stops[i]['state'] == 'done' ? C.basalt : C.line))),
              ]),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(left: 8, bottom: 12, top: 2),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text((am ? stops[i]['nameAm'] : null) as String? ?? stops[i]['name'] as String, style: TextStyle(fontWeight: stops[i]['state'] == 'upcoming' ? FontWeight.w500 : FontWeight.w800, fontSize: 15, color: stops[i]['state'] == 'upcoming' ? C.muted : C.basalt)),
                  if (stops[i]['label'] != null) Text('${stops[i]['label']}${stops[i]['pendingSync'] == true ? ' · waiting to send' : ''}', style: const TextStyle(fontSize: 12, color: C.muted)),
                ]),
              ),
            ),
          ]),
        ),
    ]);
  }

  Widget _dot(String state) => switch (state) {
        'done' => Container(width: 16, height: 16, color: C.basalt, child: const Icon(Icons.check, size: 12, color: C.amber)),
        'current' => Container(width: 18, height: 18, decoration: BoxDecoration(color: C.amber, border: Border.all(color: C.basalt, width: 3))),
        _ => Container(width: 14, height: 14, decoration: BoxDecoration(color: C.paper, border: Border.all(color: C.stone, width: 2))),
      };
}

/// Shows queued actions / offline state on every tab.
class SyncBanner extends ConsumerWidget {
  const SyncBanner({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final o = ref.watch(outboxProvider);
    if (o.pending.isEmpty && o.failed.isEmpty && o.online) return const SizedBox.shrink();
    final failed = o.failed.isNotEmpty;
    final text = failed
        ? (o.failed.first.error ?? 'An update was rejected')
        : o.pending.isEmpty
            ? ref.t('No signal — saved on your phone')
            : '${ref.t('Waiting to send')}: ${o.pending.length}';
    return Material(
      color: failed ? C.red : C.amber,
      child: InkWell(
        onTap: failed ? ref.read(outboxProvider.notifier).dismissFailed : ref.read(outboxProvider.notifier).flush,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(children: [
            Icon(failed ? Icons.error_outline : (o.online ? Icons.sync : Icons.cloud_off), size: 18, color: failed ? Colors.white : C.basalt),
            const SizedBox(width: 10),
            Expanded(child: Text(text, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: failed ? Colors.white : C.basalt))),
            if (o.syncing) const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: C.basalt)),
          ]),
        ),
      ),
    );
  }
}

class LangToggle extends ConsumerWidget {
  const LangToggle({super.key, this.dark = true});
  final bool dark;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lang = ref.watch(langProvider);
    Widget b(String code, String label) => InkWell(
          onTap: () => ref.read(langProvider.notifier).set(code),
          child: Container(constraints: const BoxConstraints(minWidth: 52, minHeight: 40), alignment: Alignment.center, color: lang == code ? C.amber : Colors.transparent, child: Text(label, style: TextStyle(fontWeight: FontWeight.w800, color: lang == code ? C.basalt : (dark ? C.bone : C.basalt)))),
        );
    return Container(decoration: BoxDecoration(border: Border.all(color: dark ? C.graphite3 : C.basalt)), child: Row(mainAxisSize: MainAxisSize.min, children: [b('en', 'EN'), b('am', 'አማ')]));
  }
}

/// Async screen body with a retry affordance.
class Async<T> extends ConsumerWidget {
  const Async(this.value, this.onRetry, this.builder, {super.key});
  final AsyncValue<T> value;
  final VoidCallback onRetry;
  final Widget Function(T data) builder;
  @override
  Widget build(BuildContext context, WidgetRef ref) => value.when(
        skipLoadingOnReload: true,
        data: builder,
        loading: () => const Center(child: CircularProgressIndicator(color: C.amber)),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon((e is ApiException && e.offline) ? Icons.cloud_off : Icons.error_outline, size: 40, color: C.muted),
              const SizedBox(height: 12),
              Text(e is ApiException ? e.message : '$e', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 16),
              OutlinedButton(onPressed: onRetry, child: Text(ref.t('Retry'))),
            ]),
          ),
        ),
      );
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.text, {super.key, this.icon = Icons.inbox_outlined});
  final String text;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Center(child: Padding(padding: const EdgeInsets.all(32), child: Column(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 44, color: C.stone), const SizedBox(height: 12), Text(text, textAlign: TextAlign.center, style: const TextStyle(color: C.muted, fontWeight: FontWeight.w600))])));
}

void toast(BuildContext c, String m, {bool error = false}) {
  ScaffoldMessenger.of(c).hideCurrentSnackBar();
  ScaffoldMessenger.of(c).showSnackBar(SnackBar(content: Text(m), backgroundColor: error ? C.red : C.basalt));
}

String errText(Object e) => e is ApiException ? e.message : 'Something went wrong';
