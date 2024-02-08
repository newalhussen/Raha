import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../app.dart';
import '../core/api.dart';
import '../core/session.dart';
import '../core/data.dart';
import '../core/fmt.dart';
import '../core/i18n.dart';
import '../core/theme.dart';
import '../core/widgets.dart';

class LoadsScreen extends ConsumerStatefulWidget {
  const LoadsScreen({super.key});
  @override
  ConsumerState<LoadsScreen> createState() => _LoadsState();
}

class _LoadsState extends ConsumerState<LoadsScreen> {
  String mode = 'route';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(loadsProvider(mode));
    Widget chip(String m, String label) => Expanded(
          child: InkWell(
            onTap: () => setState(() => mode = m),
            child: Container(height: 44, alignment: Alignment.center, decoration: BoxDecoration(color: mode == m ? C.basalt : C.paper, border: Border.all(color: C.basalt)), child: Text(label, style: TextStyle(fontWeight: FontWeight.w800, color: mode == m ? C.amber : C.basalt))),
          ),
        );
    return SafeArea(
      bottom: false,
      child: Column(children: [
        Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 8), child: Align(alignment: Alignment.centerLeft, child: Text(ref.t('Loads on your route'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)))),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Row(children: [chip('route', ref.t('On route')), chip('near', ref.t('Near me')), chip('all', ref.t('All'))])),
        const SizedBox(height: 8),
        Expanded(
          child: Async<List<Json>>(async, () => ref.invalidate(loadsProvider(mode)), (loads) {
            if (loads.isEmpty) return EmptyState(ref.t('Nothing here yet'), icon: Icons.inventory_2_outlined);
            return RefreshIndicator(
              color: C.amber,
              onRefresh: () async {
                ref.invalidate(loadsProvider(mode));
                await ref.read(loadsProvider(mode).future);
              },
              child: ListView.separated(padding: const EdgeInsets.all(16), itemCount: loads.length, separatorBuilder: (_, _) => const SizedBox(height: 12), itemBuilder: (_, i) => LoadCard(loads[i])),
            );
          }),
        ),
      ]),
    );
  }
}

class LoadCard extends ConsumerWidget {
  const LoadCard(this.l, {super.key});
  final Json l;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final am = ref.watch(langProvider) == 'am';
    final fit = l['fit'] as String;
    final tone = fit == 'best' ? Tone.dark : fit == 'fits' ? Tone.green : Tone.neutral;
    final disabled = fit == 'too_heavy' || fit == 'off_route';
    final mine = l['myMatch'] == null ? null : asMap(l['myMatch']);
    return Opacity(
      opacity: disabled ? 0.7 : 1,
      child: Box(
        border: fit == 'best' ? C.amber : null,
        onTap: () => context.push('/load/${l['shipmentId']}'),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [Expanded(child: Tag(l['fitLabel'] as String? ?? '', tone: tone)), if (mine != null) const Padding(padding: EdgeInsets.only(left: 6), child: Tag('Accepted', tone: Tone.lapis))]),
          const SizedBox(height: 10),
          Row(children: [
            Flexible(child: Text(placeName(asMap(l['pickup']), am), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 19))),
            const Padding(padding: EdgeInsets.symmetric(horizontal: 6), child: Icon(Icons.arrow_forward, size: 18)),
            Flexible(child: Text(placeName(asMap(l['dropoff']), am), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 19))),
          ]),
          const SizedBox(height: 4),
          Text('${l['cargoLabel']} · ${l['piecesLabel']} · ${kg(l['weightKg'])}', style: const TextStyle(color: C.muted, fontSize: 13)),
          Text('${ref.t('Pickup')} ${when(l['readyAt'])}${l['pickupDistanceKm'] != null ? ' · ${l['pickupDistanceKm']} km' : ''}', style: const TextStyle(color: C.muted, fontSize: 13)),
          const SizedBox(height: 10),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Kicker(ref.t('You earn')),
            Text(etb(l['priceEtb']), style: kMono.copyWith(fontWeight: FontWeight.w900, fontSize: 20)),
          ]),
        ]),
      ),
    );
  }
}

class LoadDetailScreen extends ConsumerStatefulWidget {
  const LoadDetailScreen(this.id, {super.key});
  final String id;
  @override
  ConsumerState<LoadDetailScreen> createState() => _LoadDetailState();
}

class _LoadDetailState extends ConsumerState<LoadDetailScreen> {
  bool _busy = false;

  Future<void> _accept() async {
    setState(() => _busy = true);
    try {
      final r = asMap(await ref.read(apiProvider).post('/driver/loads/${widget.id}/accept'));
      ref.invalidate(loadDetailProvider(widget.id));
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => MatchedScreen(r)));
    } catch (e) {
      if (mounted) toast(context, errText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _decline() async {
    try {
      await ref.read(apiProvider).post('/driver/loads/${widget.id}/decline', {});
      ref.invalidate(loadsProvider);
      if (mounted) context.pop();
    } catch (e) {
      if (mounted) toast(context, errText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final am = ref.watch(langProvider) == 'am';
    final async = ref.watch(loadDetailProvider(widget.id));
    final l = async.value;
    final mine = l?['myMatch'] == null ? null : asMap(l!['myMatch']);
    final canAccept = l != null && mine == null && l['fit'] != 'too_heavy' && l['fit'] != 'off_route';
    return RPage(
      title: l?['ref'] as String? ?? 'Load',
      body: Async<Json>(async, () => ref.invalidate(loadDetailProvider(widget.id)), (l) {
        final contact = l['contact'] == null ? null : asMap(l['contact']);
        Widget row(String k, String v) => Padding(padding: const EdgeInsets.symmetric(vertical: 7), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [SizedBox(width: 110, child: Text(k, style: const TextStyle(color: C.muted, fontSize: 13))), Expanded(child: Text(v, style: const TextStyle(fontWeight: FontWeight.w700)))]));
        return ListView(padding: const EdgeInsets.all(16), children: [
          Tag(l['fitLabel'] as String? ?? '', tone: l['fit'] == 'best' ? Tone.dark : Tone.neutral),
          const SizedBox(height: 12),
          Text('${placeName(asMap(l['pickup']), am)} → ${placeName(asMap(l['dropoff']), am)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 24, height: 1.15)),
          const SizedBox(height: 6),
          Text('${l['distanceKm']} km · ${l['sameDirection'] == true ? 'same direction as your route' : 'different direction'}', style: const TextStyle(color: C.muted)),
          const SizedBox(height: 16),
          Box(dark: true, child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Kicker(ref.t('You earn'), color: C.stone), Text(etb(l['priceEtb']), style: kMono.copyWith(color: C.amber, fontSize: 26, fontWeight: FontWeight.w900))])),
          const SizedBox(height: 12),
          Box(child: Column(children: [
            row(ref.t('Weight'), kg(l['weightKg'])),
            row('Cargo', '${l['cargoLabel']} · ${l['piecesLabel']}'),
            row(ref.t('Pickup'), '${l['pickupAddress']}\n${when(l['readyAt'])}'),
            row(ref.t('Drop-off'), '${l['dropoffAddress']}'),
            row('Shipper', '${l['shipperName']}${l['shipperVerified'] == true ? ' ✓' : ''}'),
            row('Paid by', '${l['paidBy']}'),
            if (contact != null && contact['phone'] != null) row('Contact', '${contact['name'] ?? ''} ${phone(contact['phone'] as String)}'),
          ])),
          const SizedBox(height: 12),
          Kicker('Your truck after this load'),
          const SizedBox(height: 8),
          CapBar(asMap(l['afterBar'])),
          const SizedBox(height: 8),
          CapLegend(asMap(l['afterBar'])),
          const SizedBox(height: 6),
          Text('${l['afterNote']}', style: const TextStyle(color: C.muted, fontSize: 13)),
          const SizedBox(height: 24),
          if (mine != null) Box(border: C.lapis, child: Text(mine['status'] == 'confirmed' ? ref.t('Load accepted') : ref.t('Waiting for the shipper to confirm'), style: const TextStyle(fontWeight: FontWeight.w800, color: C.lapis))),
        ]);
      }),
      bottom: l == null
          ? null
          : canAccept
              ? Column(mainAxisSize: MainAxisSize.min, children: [BigButton(ref.t('Accept load'), busy: _busy, onPressed: _accept), TextButton(onPressed: _decline, child: Text(ref.t('Decline')))])
              : null,
    );
  }
}

class MatchedScreen extends ConsumerWidget {
  const MatchedScreen(this.r, {super.key});
  final Json r;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final confirmed = r['state'] == 'confirmed';
    final tripId = r['tripId'] as String?;
    return Scaffold(
      backgroundColor: C.basalt,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Spacer(),
            Container(width: 72, height: 72, color: C.amber, child: const Icon(Icons.check, size: 48, color: C.basalt)),
            const SizedBox(height: 24),
            Text(confirmed ? ref.t('Load accepted') : ref.t('Waiting for the shipper to confirm'), style: const TextStyle(color: C.bone, fontSize: 30, fontWeight: FontWeight.w900, height: 1.1)),
            const SizedBox(height: 12),
            Text(confirmed ? 'The trip is on your list. Go to the pickup when you are ready.' : 'We will notify you the moment they confirm. Nothing else to do.', style: const TextStyle(color: C.stone, fontSize: 16, height: 1.4)),
            const Spacer(),
            if (confirmed && tripId != null) BigButton(ref.t('Open trip'), onPressed: () {
              Navigator.of(context).pop();
              context.go('/trips');
              context.push('/trip/$tripId');
            }),
            TextButton(onPressed: () {
              Navigator.of(context).pop();
              context.go('/loads');
            }, child: Text(ref.t('Back to home'), style: const TextStyle(color: C.stone))),
          ]),
        ),
      ),
    );
  }
}

class ReturnLoadsScreen extends ConsumerWidget {
  const ReturnLoadsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(returnLoadsProvider);
    return RPage(
      title: ref.t('Return loads'),
      body: Async<Json>(async, () => ref.invalidate(returnLoadsProvider), (r) {
        final loads = asList(r['loads']);
        final am = ref.watch(langProvider) == 'am';
        return ListView(padding: const EdgeInsets.all(16), children: [
          Box(dark: true, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${placeName(asMap(r['from']), am)} → ${placeName(asMap(r['to']), am)}', style: const TextStyle(color: C.bone, fontSize: 20, fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            Text('${kg(r['freeKg'])} ${ref.t('Free space').toLowerCase()}', style: const TextStyle(color: C.amber, fontWeight: FontWeight.w700)),
          ])),
          const SizedBox(height: 12),
          _AlertSwitch(initial: r['alertsOn'] == true),
          const SizedBox(height: 12),
          if (loads.isEmpty) SizedBox(height: 240, child: EmptyState(ref.t('Nothing here yet'), icon: Icons.u_turn_left)),
          for (final l in loads) Padding(padding: const EdgeInsets.only(bottom: 12), child: LoadCard(l)),
        ]);
      }),
    );
  }
}

class _AlertSwitch extends ConsumerStatefulWidget {
  const _AlertSwitch({required this.initial});
  final bool initial;
  @override
  ConsumerState<_AlertSwitch> createState() => _AlertSwitchState();
}

class _AlertSwitchState extends ConsumerState<_AlertSwitch> {
  late bool on = widget.initial;
  @override
  Widget build(BuildContext context) => Box(
        pad: 8,
        child: Row(children: [
          const SizedBox(width: 8),
          Expanded(child: Text(ref.t('Alert me about return loads'), style: const TextStyle(fontWeight: FontWeight.w700))),
          Switch(
            value: on,
            onChanged: (v) async {
              setState(() => on = v);
              try {
                await ref.read(apiProvider).put('/driver/return-alerts', {'on': v});
              } catch (e) {
                if (mounted) {
                  setState(() => on = !v);
                  toast(context, errText(e), error: true);
                }
              }
            },
          ),
        ]),
      );
}
