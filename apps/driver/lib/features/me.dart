import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app.dart';
import '../core/api.dart';
import '../core/data.dart';
import '../core/fmt.dart';
import '../core/i18n.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../core/widgets.dart';

class EarningsScreen extends ConsumerStatefulWidget {
  const EarningsScreen({super.key});
  @override
  ConsumerState<EarningsScreen> createState() => _EarningsState();
}

class _EarningsState extends ConsumerState<EarningsScreen> {
  String period = 'month';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(earningsProvider(period));
    Widget tab(String p, String label) => Expanded(
          child: InkWell(
            onTap: () => setState(() => period = p),
            child: Container(height: 44, alignment: Alignment.center, decoration: BoxDecoration(color: period == p ? C.basalt : C.paper, border: Border.all(color: C.basalt)), child: Text(label, style: TextStyle(fontWeight: FontWeight.w800, color: period == p ? C.amber : C.basalt))),
          ),
        );
    return SafeArea(
      bottom: false,
      child: Column(children: [
        Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 8), child: Align(alignment: Alignment.centerLeft, child: Text(ref.t('Earnings'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)))),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Row(children: [tab('week', ref.t('Week')), tab('month', ref.t('Month')), tab('year', ref.t('Year'))])),
        Expanded(
          child: Async<Json>(async, () => ref.invalidate(earningsProvider(period)), (e) {
            final series = asList(e['series']);
            final maxV = series.fold<num>(1, (m, s) => (s['etb'] as num) > m ? s['etb'] as num : m);
            final items = asList(e['items']);
            return RefreshIndicator(
              color: C.amber,
              onRefresh: () async {
                ref.invalidate(earningsProvider(period));
                await ref.read(earningsProvider(period).future);
              },
              child: ListView(padding: const EdgeInsets.all(16), children: [
                Box(dark: true, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Kicker(e['label'] as String? ?? '', color: C.stone),
                  const SizedBox(height: 6),
                  Text(etb(e['totalEtb'] ?? 0), style: kMono.copyWith(color: C.amber, fontSize: 32, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 4),
                  Text('${e['trips']} trips · Raha matches ${etb(e['matchEtb'] ?? 0)}', style: const TextStyle(color: C.stone, fontSize: 13)),
                  const SizedBox(height: 16),
                  SizedBox(
                    height: 90,
                    child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      for (final s in series)
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 2),
                            child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                              Container(height: ((s['etb'] as num) / maxV * 66).toDouble().clamp(2, 66), color: C.amber),
                              const SizedBox(height: 4),
                              Text('${s['label']}', maxLines: 1, overflow: TextOverflow.clip, style: const TextStyle(color: C.stone, fontSize: 10)),
                            ]),
                          ),
                        ),
                    ]),
                  ),
                ])),
                const SizedBox(height: 16),
                if (items.isEmpty) SizedBox(height: 160, child: EmptyState(ref.t('Nothing here yet'), icon: Icons.payments_outlined)),
                for (final i in items)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Box(
                      onTap: () => context.push('/trip/${i['tripId']}/done'),
                      child: Row(children: [
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(i['route'] as String, style: const TextStyle(fontWeight: FontWeight.w800)),
                          Text('${i['whenLabel']} · ${i['drops']} drop${i['drops'] == 1 ? '' : 's'}', style: const TextStyle(color: C.muted, fontSize: 12)),
                        ])),
                        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                          Text(etb(i['amountEtb']), style: kMono.copyWith(fontWeight: FontWeight.w800)),
                          Tag(i['status'] == 'paid' ? ref.t('Paid') : ref.t('Pending'), tone: i['status'] == 'paid' ? Tone.green : Tone.amber),
                        ]),
                      ]),
                    ),
                  ),
              ]),
            );
          }),
        ),
      ]),
    );
  }
}

class MeScreen extends ConsumerWidget {
  const MeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(profileProvider);
    return SafeArea(
      bottom: false,
      child: Async<Json>(async, () => ref.invalidate(profileProvider), (p) {
        final rows = asList(p['verification']);
        Tone tone(String s) => switch (s) { 'verified' => Tone.green, 'pending' => Tone.amber, 'expiring' => Tone.amber, _ => Tone.red };
        return RefreshIndicator(
          color: C.amber,
          onRefresh: () async {
            ref.invalidate(profileProvider);
            await ref.read(profileProvider.future);
          },
          child: ListView(padding: const EdgeInsets.all(16), children: [
            Row(children: [
              Container(width: 60, height: 60, color: C.basalt, alignment: Alignment.center, child: Text(p['initials'] as String, style: const TextStyle(color: C.amber, fontWeight: FontWeight.w900, fontSize: 22))),
              const SizedBox(width: 14),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(p['fullName'] as String, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 22)),
                Text(phone(p['phone'] as String), style: kMono.copyWith(color: C.muted)),
                Text('${p['fleetName'] ?? 'Owner-driver'} · since ${p['sinceYear']}', style: const TextStyle(color: C.muted, fontSize: 13)),
              ])),
            ]),
            const SizedBox(height: 20),
            Kicker(ref.t('Documents')),
            const SizedBox(height: 8),
            Box(pad: 0, child: Column(children: [
              for (var i = 0; i < rows.length; i++) ...[
                if (i > 0) const Divider(),
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(children: [
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(rows[i]['label'] as String, style: const TextStyle(fontWeight: FontWeight.w700)), if (rows[i]['note'] != null) Text('${rows[i]['note']}', style: const TextStyle(color: C.muted, fontSize: 12))])),
                    Tag(rows[i]['state'] as String, tone: tone(rows[i]['state'] as String)),
                  ]),
                ),
              ],
            ])),
            const SizedBox(height: 12),
            Box(onTap: () => context.push('/vehicle'), child: Row(children: [const Icon(Icons.local_shipping_outlined), const SizedBox(width: 12), Expanded(child: Text(ref.t('My truck'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))), const Icon(Icons.chevron_right)])),
            const SizedBox(height: 12),
            Box(child: Row(children: [const Icon(Icons.translate), const SizedBox(width: 12), Expanded(child: Text(ref.t('Language'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))), const LangToggle(dark: false)])),
            const SizedBox(height: 12),
            OutlinedButton.icon(onPressed: () => launchUrl(Uri.parse('tel:${p['supportNumber']}')), icon: const Icon(Icons.call), label: Text('${ref.t('Call support')} · ${p['supportNumber']}')),
            const SizedBox(height: 10),
            TextButton(onPressed: ref.read(sessionProvider.notifier).logout, child: Text(ref.t('Sign out'), style: const TextStyle(color: C.red, fontWeight: FontWeight.w800))),
          ]),
        );
      }),
    );
  }
}

class VehicleScreen extends ConsumerStatefulWidget {
  const VehicleScreen({super.key});
  @override
  ConsumerState<VehicleScreen> createState() => _VehicleState();
}

class _VehicleState extends ConsumerState<VehicleScreen> {
  final _kg = TextEditingController();
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(vehicleProvider);
    return RPage(
      title: ref.t('My truck'),
      body: Async<Json?>(async, () => ref.invalidate(vehicleProvider), (v) {
        if (v == null) return const EmptyState('No truck is linked to your account yet. Ask your fleet manager to add you to a truck.', icon: Icons.local_shipping_outlined);
        if (_kg.text.isEmpty) _kg.text = '${v['currentLoadKg']}';
        return ListView(padding: const EdgeInsets.all(16), children: [
          Text(v['plate'] as String, style: kMono.copyWith(fontSize: 30, fontWeight: FontWeight.w900)),
          Text('${v['label']} · ${v['bodyLabel']} · ${kg(v['maxLoadKg'])}', style: const TextStyle(color: C.muted)),
          const SizedBox(height: 8),
          Tag(v['verified'] == true ? 'Verified' : 'Not verified', tone: v['verified'] == true ? Tone.green : Tone.amber),
          const SizedBox(height: 20),
          CapBar(asMap(v['bar']), height: 30),
          const SizedBox(height: 8),
          CapLegend(asMap(v['bar'])),
          const SizedBox(height: 24),
          Kicker(ref.t('Update loaded weight')),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: TextField(controller: _kg, keyboardType: TextInputType.number, inputFormatters: [FilteringTextInputFormatter.digitsOnly], decoration: const InputDecoration(suffixText: 'kg'))),
            const SizedBox(width: 10),
            SizedBox(
              width: 120,
              child: FilledButton(
                onPressed: _busy ? null : () async {
                  setState(() => _busy = true);
                  try {
                    await ref.read(apiProvider).patch('/driver/vehicle/load', {'loadedKg': int.tryParse(_kg.text) ?? 0});
                    ref.invalidate(vehicleProvider);
                    ref.invalidate(homeProvider);
                    if (mounted) toast(context, 'Saved');
                  } catch (e) {
                    if (mounted) toast(context, errText(e), error: true);
                  } finally {
                    if (mounted) setState(() => _busy = false);
                  }
                },
                child: Text(ref.t('Save')),
              ),
            ),
          ]),
          const SizedBox(height: 16),
          Text('Owner: ${v['ownerName']}', style: const TextStyle(color: C.muted)),
        ]);
      }),
    );
  }
}

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationsProvider);
    return RPage(
      title: ref.t('Notifications'),
      body: Async<Json>(async, () => ref.invalidate(notificationsProvider), (r) {
        final items = asList(r['items']);
        final unread = items.where((n) => n['read'] != true).map((n) => n['id'] as String).toList();
        if (unread.isNotEmpty) {
          Future.microtask(() async {
            try {
              await ref.read(apiProvider).post('/notifications/read', {'ids': unread});
              ref.invalidate(homeProvider);
            } catch (_) {}
          });
        }
        if (items.isEmpty) return EmptyState(ref.t('Nothing here yet'), icon: Icons.notifications_none);
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: items.length,
          separatorBuilder: (_, _) => const SizedBox(height: 10),
          itemBuilder: (_, i) {
            final n = items[i];
            return Box(
              border: n['read'] == true ? null : C.amber,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [Expanded(child: Text(n['title'] as String, style: const TextStyle(fontWeight: FontWeight.w800))), Text(when(n['createdAt']), style: const TextStyle(color: C.muted, fontSize: 11))]),
                const SizedBox(height: 4),
                Text(n['body'] as String, style: const TextStyle(color: C.muted, height: 1.35)),
              ]),
            );
          },
        );
      }),
    );
  }
}
