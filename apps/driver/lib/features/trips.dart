import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/api.dart';
import '../core/data.dart';
import '../core/fmt.dart';
import '../core/i18n.dart';
import '../core/theme.dart';
import '../core/widgets.dart';

class TripsScreen extends ConsumerStatefulWidget {
  const TripsScreen({super.key});
  @override
  ConsumerState<TripsScreen> createState() => _TripsState();
}

class _TripsState extends ConsumerState<TripsScreen> {
  String state = 'active';

  @override
  Widget build(BuildContext context) {
    final am = ref.watch(langProvider) == 'am';
    final async = ref.watch(tripListProvider(state));
    Widget tab(String s, String label) => Expanded(
          child: InkWell(
            onTap: () => setState(() => state = s),
            child: Container(height: 44, alignment: Alignment.center, decoration: BoxDecoration(color: state == s ? C.basalt : C.paper, border: Border.all(color: C.basalt)), child: Text(label, style: TextStyle(fontWeight: FontWeight.w800, color: state == s ? C.amber : C.basalt))),
          ),
        );
    return SafeArea(
      bottom: false,
      child: Column(children: [
        Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 8), child: Align(alignment: Alignment.centerLeft, child: Text(ref.t('Trips'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)))),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Row(children: [tab('active', ref.t('Active')), tab('completed', ref.t('Completed'))])),
        const SizedBox(height: 8),
        Expanded(
          child: Async<List<Json>>(async, () => ref.invalidate(tripListProvider(state)), (trips) {
            if (trips.isEmpty) return EmptyState(ref.t('No trips yet'), icon: Icons.route_outlined);
            return RefreshIndicator(
              color: C.amber,
              onRefresh: () async {
                ref.invalidate(tripListProvider(state));
                await ref.read(tripListProvider(state).future);
              },
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: trips.length,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (_, i) {
                  final t = trips[i];
                  final lines = asList(t['loadLines']);
                  return Box(
                    onTap: () => context.push(state == 'active' ? '/trip/${t['id']}' : '/trip/${t['id']}/done'),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [Text(t['ref'] as String, style: kMono.copyWith(color: C.muted, fontSize: 12)), const Spacer(), Tag(t['statusLabel'] as String? ?? '', tone: toneOf(t['tone'] as String?))]),
                      const SizedBox(height: 8),
                      Text('${placeName(asMap(t['origin']), am)} → ${placeName(asMap(t['destination']), am)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 19)),
                      const SizedBox(height: 6),
                      for (final l in lines) Text('${l['shipperName']} · ${kg(l['weightKg'])}${l['isRahaMatch'] == true ? ' · Raha' : ''} · ${l['label']}', style: const TextStyle(color: C.muted, fontSize: 13)),
                      const SizedBox(height: 8),
                      Text(etb(t['totalEtb'] ?? 0), style: kMono.copyWith(fontWeight: FontWeight.w900, fontSize: 18)),
                    ]),
                  );
                },
              ),
            );
          }),
        ),
      ]),
    );
  }
}
