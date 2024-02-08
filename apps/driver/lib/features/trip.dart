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
import '../core/outbox.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../core/widgets.dart';

Future<void> _open(String url) => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);

class _Steps extends StatelessWidget {
  const _Steps(this.step);
  final int step;
  @override
  Widget build(BuildContext context) {
    const labels = ['Pickup', 'Load', 'Depart', 'Road', 'Deliver'];
    return Row(children: [
      for (var i = 0; i < 5; i++) ...[
        Expanded(
          child: Column(children: [
            Container(height: 6, color: i + 1 < step ? C.amber : (i + 1 == step ? C.amber : C.graphite3)),
            const SizedBox(height: 4),
            Text(labels[i], style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: i + 1 <= step ? C.amber : C.stone)),
          ]),
        ),
        if (i < 4) const SizedBox(width: 4),
      ]
    ]);
  }
}

class TripScreen extends ConsumerStatefulWidget {
  const TripScreen(this.id, {super.key});
  final String id;
  @override
  ConsumerState<TripScreen> createState() => _TripState();
}

class _TripState extends ConsumerState<TripScreen> {
  bool _busy = false;
  bool _counted = false, _noDamage = false, _waybill = false;
  String? _photo;

  Future<void> _run(Future<void> Function() f) async {
    setState(() => _busy = true);
    try {
      await f();
      ref.invalidate(tripProvider(widget.id));
    } catch (e) {
      if (mounted) toast(context, errText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Json? _firstLoad(Json t, Set<String> statuses) {
    final loads = asList(t['loads'])..sort((a, b) => (a['dropOrder'] as num).compareTo(b['dropOrder'] as num));
    for (final l in loads) {
      if (statuses.contains(l['status'])) return l;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final am = ref.watch(langProvider) == 'am';
    final async = ref.watch(tripProvider(widget.id));
    ref.listen(tripProvider(widget.id), (_, n) {
      final t = n.value;
      if (t != null && tripStep(t) == 6) context.pushReplacement('/trip/${widget.id}/done');
    });
    final acts = ref.read(tripActionsProvider);
    final t = async.value;
    final step = t == null ? 1 : tripStep(t);

    Widget? bottom;
    Widget content = const SizedBox.shrink();

    if (t != null) {
      final planned = t['status'] == 'planned';
      final strip = asMap(t['strip']);
      final towns = asList(strip['stops']).where((s) => s['kind'] == 'town' && s['state'] != 'done').toList();
      final nextStop = towns.isEmpty ? null : towns.first;

      if (planned && step == 1) {
        content = _Hint(ref.t('Begin trip'), am ? 'ወደ መጫኛ ቦታ መንገድ ሲጀምሩ ይጫኑ።' : 'Tap when you leave for the first pickup.');
        bottom = BigButton(ref.t('Begin trip'), icon: Icons.play_arrow, busy: _busy, onPressed: () => _run(() => acts.begin(widget.id)));
      } else if (step == 1) {
        final l = _firstLoad(t, {'assigned'});
        if (l != null) {
          final p = asMap(l['pickup']);
          content = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Kicker('${ref.t('Pickup')} · ${l['shipperName']}'),
            const SizedBox(height: 8),
            Box(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(placeName(asMap(p['place']), am), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 22)),
              const SizedBox(height: 4),
              Text('${p['address']}', style: const TextStyle(color: C.muted, height: 1.35)),
              const SizedBox(height: 4),
              Text('${kg(l['weightKg'])} · ${l['cargoLabel']} · ${l['piecesLabel']} · ${when(p['readyAt'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              Row(children: [
                if (p['contactPhone'] != null) Expanded(child: OutlinedButton.icon(onPressed: () => _open('tel:${p['contactPhone']}'), icon: const Icon(Icons.call), label: Text(p['contactName'] as String? ?? 'Call'))),
                if (p['contactPhone'] != null && p['lat'] != null) const SizedBox(width: 10),
                if (p['lat'] != null) Expanded(child: OutlinedButton.icon(onPressed: () => _open('https://www.google.com/maps/search/?api=1&query=${p['lat']},${p['lng']}'), icon: const Icon(Icons.map_outlined), label: const Text('Map'))),
              ]),
            ])),
          ]);
          bottom = BigButton(ref.t('I have arrived'), icon: Icons.place, busy: _busy, onPressed: () => _run(() => acts.arrive(widget.id, l['loadId'] as String)));
        }
      } else if (step == 2) {
        final l = _firstLoad(t, {'arrived_pickup'});
        if (l != null) {
          content = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Kicker('${l['shipperName']} · ${l['piecesLabel']}'),
            const SizedBox(height: 8),
            Box(pad: 4, child: Column(children: [
              _Check(ref.t('Cargo counted'), _counted, (v) => setState(() => _counted = v)),
              _Check(ref.t('No visible damage'), _noDamage, (v) => setState(() => _noDamage = v)),
              _Check(ref.t('Waybill received'), _waybill, (v) => setState(() => _waybill = v)),
            ])),
            const SizedBox(height: 14),
            PhotoTile(label: ref.t('Take photo of the loaded cargo'), retake: ref.t('Retake photo'), photo: _photo, onTap: () async {
              final p = await capturePhoto(ref.read(apiProvider));
              if (p != null) setState(() => _photo = p);
            }),
          ]);
          bottom = BigButton(ref.t('Confirm pickup'), icon: Icons.check, busy: _busy, onPressed: (_counted && _photo != null) ? () => _run(() async {
                await acts.pickup(widget.id, l['loadId'] as String, counted: _counted, noDamage: _noDamage, waybill: _waybill, photos: [_photo!]);
                setState(() {
                  _photo = null;
                  _counted = _noDamage = _waybill = false;
                });
              }) : null);
        }
      } else if (step == 3) {
        content = _Hint(ref.t('Start trip'), am ? 'ሲጀምሩ ተቀባዮች የርክክብ ፒን በኤስኤምኤስ ይደርሳቸዋል።' : 'Receivers get their delivery PIN by SMS when you start.');
        bottom = BigButton(ref.t('Start trip'), icon: Icons.local_shipping, busy: _busy, onPressed: () => _run(() => acts.start(widget.id)));
      } else if (step == 4 || step == 5) {
        final transit = asList(t['loads']).where((l) => l['status'] == 'in_transit').toList();
        content = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Kicker(t['etaAt'] != null ? 'ETA ${hm(t['etaAt'])}' : 'On the road'),
          const SizedBox(height: 8),
          Box(child: Strip(strip, am: am)),
          const SizedBox(height: 16),
          Kicker('${ref.t('Deliver')} (${transit.length})'),
          const SizedBox(height: 8),
          for (final l in transit)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Box(
                onTap: () => context.push('/trip/${widget.id}/deliver/${l['loadId']}'),
                child: Row(children: [
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(placeName(asMap(asMap(l['dropoff'])['place']), am), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
                    Text('${l['shipperName']} · ${kg(l['weightKg'])} · ${asMap(l['receiver'])['name']}', style: const TextStyle(color: C.muted, fontSize: 13)),
                  ])),
                  const Icon(Icons.chevron_right, size: 28),
                ]),
              ),
            ),
        ]);
        bottom = nextStop == null
            ? null
            : BigButton('${ref.t('Check in at')} ${(am ? nextStop['nameAm'] : null) ?? nextStop['name']}', icon: Icons.flag, dark: true, busy: _busy, onPressed: () => _run(() => acts.checkin(widget.id, nextStop['placeId'] as String, nextStop['name'] as String)));
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(t?['ref'] as String? ?? 'Trip'),
        actions: [IconButton(tooltip: ref.t('Report a problem'), onPressed: () => context.push('/trip/${widget.id}/issue'), icon: const Icon(Icons.report_gmailerrorred))],
      ),
      body: Column(children: [
        const SyncBanner(),
        if (t != null)
          Container(
            color: C.basalt,
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${placeName(asMap(t['origin']), am)} → ${placeName(asMap(t['destination']), am)}', style: const TextStyle(color: C.bone, fontSize: 22, fontWeight: FontWeight.w900)),
              const SizedBox(height: 12),
              _Steps(step),
            ]),
          ),
        Expanded(child: Async<Json>(async, () => ref.invalidate(tripProvider(widget.id)), (_) => ListView(padding: const EdgeInsets.all(16), children: [content]))),
      ]),
      bottomNavigationBar: bottom == null ? null : SafeArea(child: Padding(padding: const EdgeInsets.all(16), child: bottom)),
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint(this.title, this.body);
  final String title, body;
  @override
  Widget build(BuildContext context) => Box(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20)), const SizedBox(height: 6), Text(body, style: const TextStyle(color: C.muted, height: 1.4))]));
}

class _Check extends StatelessWidget {
  const _Check(this.label, this.value, this.onChanged);
  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: () => onChanged(!value),
        child: Container(
          constraints: const BoxConstraints(minHeight: 56),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(children: [
            Container(width: 28, height: 28, decoration: BoxDecoration(color: value ? C.amber : Colors.white, border: Border.all(color: C.basalt, width: 2)), child: value ? const Icon(Icons.check, size: 20, color: C.basalt) : null),
            const SizedBox(width: 14),
            Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
          ]),
        ),
      );
}

class PhotoTile extends StatelessWidget {
  const PhotoTile({super.key, required this.label, required this.retake, required this.photo, required this.onTap});
  final String label, retake;
  final String? photo;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: Container(
          height: 96,
          decoration: BoxDecoration(color: photo == null ? C.paper : C.greenTint, border: Border.all(color: photo == null ? C.basalt : C.green, width: 2)),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(photo == null ? Icons.photo_camera_outlined : Icons.check_circle, size: 30, color: photo == null ? C.basalt : C.green),
            const SizedBox(width: 12),
            Flexible(child: Text(photo == null ? label : retake, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: photo == null ? C.basalt : C.green))),
          ]),
        ),
      );
}

// ───────────────────────── delivery: PIN + proof ─────────────────────────

class DeliverScreen extends ConsumerStatefulWidget {
  const DeliverScreen(this.tripId, this.loadId, {super.key});
  final String tripId, loadId;
  @override
  ConsumerState<DeliverScreen> createState() => _DeliverState();
}

class _DeliverState extends ConsumerState<DeliverScreen> {
  String _pin = '';
  String _condition = 'all_good';
  final _count = TextEditingController();
  String? _photo;
  bool _busy = false, _wrong = false;

  void _key(String k) {
    if (_pin.length >= 4) return;
    HapticFeedback.selectionClick();
    setState(() {
      _pin += k;
      _wrong = false;
    });
  }

  Future<void> _confirm(Json load) async {
    final pc = load['pinCheck'] == null ? null : asMap(load['pinCheck']);
    final prefs = ref.read(prefsProvider);
    final key = 'pin.tries.${load['loadId']}';
    final tries = prefs.getInt(key) ?? 0;
    if (pc != null) {
      if (tries >= 5) {
        toast(context, 'Too many wrong PINs. Call Raha support.', error: true);
        return;
      }
      if (!pinMatches(pc['salt'] as String, pc['digest'] as String, _pin)) {
        await prefs.setInt(key, tries + 1);
        HapticFeedback.heavyImpact();
        setState(() {
          _wrong = true;
          _pin = '';
        });
        return;
      }
    }
    setState(() => _busy = true);
    try {
      await ref.read(tripActionsProvider).deliver(widget.tripId, widget.loadId, pin: _pin, condition: _condition, receivedCount: _condition == 'short_count' ? int.tryParse(_count.text) : null, photo: _photo);
      ref.invalidate(tripProvider(widget.tripId));
      if (!mounted) return;
      final t = await ref.read(tripProvider(widget.tripId).future);
      if (!mounted) return;
      if (tripStep(t) == 6) {
        context.pushReplacement('/trip/${widget.tripId}/done');
      } else {
        context.pop();
      }
    } catch (e) {
      if (mounted) toast(context, errText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final am = ref.watch(langProvider) == 'am';
    final async = ref.watch(tripProvider(widget.tripId));
    final load = async.value == null ? null : asList(async.value!['loads']).where((l) => l['loadId'] == widget.loadId).firstOrNull;
    final ready = _pin.length == 4 && _photo != null && (_condition != 'short_count' || (int.tryParse(_count.text) != null));
    return RPage(
      title: ref.t('Enter delivery PIN'),
      body: load == null
          ? Async<Json>(async, () => ref.invalidate(tripProvider(widget.tripId)), (_) => const SizedBox.shrink())
          : ListView(padding: const EdgeInsets.all(16), children: [
              Text(placeName(asMap(asMap(load['dropoff'])['place']), am), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 24)),
              Text('${asMap(load['receiver'])['name']} · ${phone(asMap(load['receiver'])['phone'] as String?)}', style: const TextStyle(color: C.muted)),
              const SizedBox(height: 4),
              Text(ref.t('Ask the receiver for the 4-digit PIN'), style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                for (var i = 0; i < 4; i++)
                  Container(
                    width: 64,
                    height: 76,
                    margin: const EdgeInsets.symmetric(horizontal: 5),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _wrong ? C.red : (i == _pin.length ? C.amber : C.basalt), width: i == _pin.length ? 3 : 2)),
                    child: Text(i < _pin.length ? _pin[i] : '', style: kMono.copyWith(fontSize: 38, fontWeight: FontWeight.w900)),
                  ),
              ]),
              if (_wrong) Padding(padding: const EdgeInsets.only(top: 10), child: Center(child: Text(ref.t('Wrong PIN'), style: const TextStyle(color: C.red, fontWeight: FontWeight.w800)))),
              if (load['pinCheck'] == null) const Padding(padding: EdgeInsets.only(top: 10), child: Center(child: Text('The PIN will be checked when you are back online.', style: TextStyle(color: C.muted, fontSize: 12)))),
              const SizedBox(height: 16),
              _Keypad(onKey: _key, onBack: () => setState(() => _pin = _pin.isEmpty ? '' : _pin.substring(0, _pin.length - 1))),
              const SizedBox(height: 20),
              Row(children: [
                for (final c in [('all_good', 'All good'), ('short_count', 'Short count'), ('damaged', 'Damaged')])
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: InkWell(
                        onTap: () => setState(() => _condition = c.$1),
                        child: Container(height: 52, alignment: Alignment.center, decoration: BoxDecoration(color: _condition == c.$1 ? (c.$1 == 'all_good' ? C.basalt : C.red) : C.paper, border: Border.all(color: C.basalt)), child: Text(ref.t(c.$2), textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: _condition == c.$1 ? Colors.white : C.basalt))),
                      ),
                    ),
                  ),
              ]),
              if (_condition == 'short_count') Padding(padding: const EdgeInsets.only(top: 12), child: TextField(controller: _count, keyboardType: TextInputType.number, inputFormatters: [FilteringTextInputFormatter.digitsOnly], onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: '${ref.t('Pieces received')} (${load['pieces'] ?? '?'})'))),
              const SizedBox(height: 14),
              PhotoTile(label: ref.t('Photo of delivered cargo'), retake: ref.t('Retake photo'), photo: _photo, onTap: () async {
                final p = await capturePhoto(ref.read(apiProvider));
                if (p != null) setState(() => _photo = p);
              }),
            ]),
      bottom: BigButton(ref.t('Confirm delivery'), icon: Icons.check_circle, busy: _busy, onPressed: (load != null && ready) ? () => _confirm(load) : null),
    );
  }
}

class _Keypad extends StatelessWidget {
  const _Keypad({required this.onKey, required this.onBack});
  final ValueChanged<String> onKey;
  final VoidCallback onBack;
  @override
  Widget build(BuildContext context) {
    Widget key(String label, VoidCallback f, {IconData? icon}) => Expanded(
          child: Padding(
            padding: const EdgeInsets.all(3),
            child: InkWell(
              onTap: f,
              child: Container(height: 60, alignment: Alignment.center, decoration: BoxDecoration(color: C.paper, border: Border.all(color: C.lineStrong)), child: icon != null ? Icon(icon) : Text(label, style: kMono.copyWith(fontSize: 26, fontWeight: FontWeight.w800))),
            ),
          ),
        );
    Widget row(List<String> ks) => Row(children: [for (final k in ks) key(k, () => onKey(k))]);
    return Column(children: [
      row(['1', '2', '3']),
      row(['4', '5', '6']),
      row(['7', '8', '9']),
      Row(children: [const Expanded(child: SizedBox()), key('0', () => onKey('0')), key('', onBack, icon: Icons.backspace_outlined)]),
    ]);
  }
}

// ───────────────────────── completed ─────────────────────────

class TripDoneScreen extends ConsumerWidget {
  const TripDoneScreen(this.id, {super.key});
  final String id;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(tripProvider(id));
    return Scaffold(
      backgroundColor: C.basalt,
      body: SafeArea(
        child: Async<Json>(async, () => ref.invalidate(tripProvider(id)), (t) {
          final s = t['summary'] == null ? null : asMap(t['summary']);
          final lines = s == null ? <Json>[] : asList(s['lines']);
          return ListView(padding: const EdgeInsets.all(24), children: [
            const SizedBox(height: 24),
            Container(width: 64, height: 64, color: C.amber, child: const Icon(Icons.check, size: 44, color: C.basalt)),
            const SizedBox(height: 20),
            Text(ref.t('Trip complete'), style: const TextStyle(color: C.bone, fontSize: 32, fontWeight: FontWeight.w900)),
            Text(t['ref'] as String, style: kMono.copyWith(color: C.stone)),
            const SizedBox(height: 24),
            Box(dark: true, border: C.graphite3, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Kicker(ref.t('Your payment'), color: C.stone),
              const SizedBox(height: 10),
              for (final l in lines)
                Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Row(children: [Expanded(child: Text(l['label'] as String, style: const TextStyle(color: C.bone))), Text(etb(l['amountEtb']), style: kMono.copyWith(color: C.bone, fontWeight: FontWeight.w700))])),
              const Divider(color: C.graphite3, height: 24),
              Row(children: [const Expanded(child: Text('Total', style: TextStyle(color: C.bone, fontWeight: FontWeight.w800))), Text(etb(s?['totalEtb'] ?? t['totalEtb'] ?? 0), style: kMono.copyWith(color: C.amber, fontSize: 24, fontWeight: FontWeight.w900))]),
              const SizedBox(height: 10),
              Text(s?['paymentNote'] as String? ?? 'Payment details appear once your phone has synced.', style: const TextStyle(color: C.stone, fontSize: 13, height: 1.4)),
            ])),
            const SizedBox(height: 28),
            BigButton(ref.t('Find a return load'), icon: Icons.u_turn_left, onPressed: () {
              context.go('/home');
              context.push('/return');
            }),
            TextButton(onPressed: () => context.go('/home'), child: Text(ref.t('Back to home'), style: const TextStyle(color: C.stone))),
          ]);
        }),
      ),
    );
  }
}

class IssueScreen extends ConsumerStatefulWidget {
  const IssueScreen(this.id, {super.key});
  final String id;
  @override
  ConsumerState<IssueScreen> createState() => _IssueState();
}

class _IssueState extends ConsumerState<IssueScreen> {
  String kind = 'delay';
  final _text = TextEditingController();
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    const kinds = [('delay', 'Delay'), ('breakdown', 'Breakdown'), ('cargo_problem', 'Cargo problem'), ('safety', 'Safety'), ('other', 'Other')];
    return RPage(
      title: ref.t('Report a problem'),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final k in kinds) ChoiceChip(label: Text(k.$2), selected: kind == k.$1, onSelected: (_) => setState(() => kind = k.$1), selectedColor: C.amber, shape: const RoundedRectangleBorder(), labelStyle: const TextStyle(fontWeight: FontWeight.w700), padding: const EdgeInsets.all(10)),
        ]),
        const SizedBox(height: 16),
        TextField(controller: _text, maxLines: 5, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: 'What happened?')),
      ]),
      bottom: BigButton('Send report', busy: _busy, onPressed: _text.text.trim().length < 3 ? null : () async {
        setState(() => _busy = true);
        try {
          await ref.read(apiProvider).post('/driver/trips/${widget.id}/issues', {'kind': kind, 'text': _text.text.trim()});
          if (mounted) {
            toast(context, 'Raha support has been told.');
            context.pop();
          }
        } catch (e) {
          if (mounted) toast(context, errText(e), error: true);
        } finally {
          if (mounted) setState(() => _busy = false);
        }
      }),
    );
  }
}
