import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/api.dart';
import '../core/data.dart';
import '../core/fmt.dart';
import '../core/i18n.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../core/widgets.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});
  @override
  ConsumerState<HomeScreen> createState() => _HomeState();
}

class _HomeState extends ConsumerState<HomeScreen> {
  bool? _avail;

  Future<void> _toggle(bool v) async {
    setState(() => _avail = v);
    try {
      await ref.read(apiProvider).put('/driver/availability', {'available': v});
      ref.invalidate(homeProvider);
    } catch (e) {
      if (mounted) {
        setState(() => _avail = !v);
        toast(context, errText(e), error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final am = ref.watch(langProvider) == 'am';
    final home = ref.watch(homeProvider);
    return Async<Json>(home, () => ref.invalidate(homeProvider), (h) {
      final d = asMap(h['driver']);
      final route = h['route'] == null ? null : asMap(h['route']);
      final sug = h['suggestion'] == null ? null : asMap(h['suggestion']);
      final avail = _avail ?? d['available'] == true;
      final unread = (h['unreadCount'] as num?)?.toInt() ?? 0;
      return RefreshIndicator(
        color: C.amber,
        onRefresh: () async {
          ref.invalidate(homeProvider);
          await ref.read(homeProvider.future);
        },
        child: ListView(padding: EdgeInsets.zero, children: [
          Container(
            color: C.basalt,
            padding: EdgeInsets.fromLTRB(16, MediaQuery.paddingOf(context).top > 20 ? 8 : 16, 16, 20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(width: 44, height: 44, color: C.amber, alignment: Alignment.center, child: Text(d['initials'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w900, color: C.basalt, fontSize: 16))),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(d['name'] as String? ?? '', style: const TextStyle(color: C.bone, fontWeight: FontWeight.w800, fontSize: 17)),
                  if (d['plate'] != null) Text(d['plate'] as String, style: kMono.copyWith(color: C.stone, fontSize: 13)),
                ])),
                IconButton(
                  onPressed: () => context.push('/notifications'),
                  icon: Badge(isLabelVisible: unread > 0, label: Text('$unread'), backgroundColor: C.amber, textColor: C.basalt, child: const Icon(Icons.notifications_none, color: C.bone, size: 28)),
                ),
              ]),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(border: Border.all(color: avail ? C.amber : C.graphite3), color: C.graphite),
                child: Row(children: [
                  Expanded(child: Text(avail ? ref.t('Available') : ref.t('Not available'), style: TextStyle(color: avail ? C.amber : C.stone, fontWeight: FontWeight.w800, fontSize: 16))),
                  Switch(value: avail, onChanged: _toggle),
                ]),
              ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (h['activeTripId'] != null) ...[
                BigButton(ref.t('Continue trip'), icon: Icons.local_shipping, onPressed: () => context.push('/trip/${h['activeTripId']}')),
                const SizedBox(height: 16),
              ],
              Kicker(ref.t('Today\'s route')),
              const SizedBox(height: 8),
              if (route == null)
                Box(child: Text(am ? 'ዛሬ የተመዘገበ መስመር የለም። መስመር ከአስተዳዳሪዎ ይጠይቁ።' : 'No route posted for today. Ask your fleet manager to post your truck\'s route.', style: const TextStyle(color: C.muted, height: 1.4)))
              else
                Box(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Flexible(child: Text(placeName(asMap(route['origin']), am), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20))),
                      const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Icon(Icons.arrow_forward, size: 20)),
                      Flexible(child: Text(placeName(asMap(route['destination']), am), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20))),
                    ]),
                    const SizedBox(height: 4),
                    Text('${ref.t('Loaded')}: ${kg(route['loadedKg'])} · ${when(route['departsAt'])}', style: const TextStyle(color: C.muted, fontSize: 13)),
                    const SizedBox(height: 14),
                    CapBar(asMap(route['bar'])),
                    const SizedBox(height: 8),
                    CapLegend(asMap(route['bar'])),
                  ]),
                ),
              if (sug != null) ...[
                const SizedBox(height: 16),
                Box(
                  dark: true,
                  onTap: () => context.go('/loads'),
                  child: Row(children: [
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(am ? '${sug['count']} ጭነቶች በቦታዎ ይገባሉ' : '${sug['count']} loads fit your space', style: const TextStyle(color: C.bone, fontWeight: FontWeight.w900, fontSize: 18)),
                      const SizedBox(height: 4),
                      Text('${kg(sug['freeKg'])} free · best ${etb(sug['bestPriceEtb'])} → ${sug['destinationName']}', style: const TextStyle(color: C.stone, fontSize: 13)),
                    ])),
                    const Icon(Icons.chevron_right, color: C.amber, size: 30),
                  ]),
                ),
              ],
              const SizedBox(height: 16),
              Row(children: [
                Expanded(child: _Stat(ref.t('This week'), etb(h['weekEarningsEtb'] ?? 0))),
                const SizedBox(width: 12),
                Expanded(child: _Stat(ref.t('Trips done'), '${h['tripsDoneWeek'] ?? 0}')),
              ]),
              const SizedBox(height: 16),
              OutlinedButton.icon(onPressed: () => context.push('/return'), icon: const Icon(Icons.u_turn_left), label: Text(ref.t('Find a return load'))),
            ]),
          ),
        ]),
      );
    });
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value);
  final String label, value;
  @override
  Widget build(BuildContext context) => Box(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Kicker(label), const SizedBox(height: 6), Text(value, style: kMono.copyWith(fontSize: 20, fontWeight: FontWeight.w800))]));
}
