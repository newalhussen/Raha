import 'package:flutter_test/flutter_test.dart';
import 'package:raha_driver/core/data.dart';
import 'package:raha_driver/core/fmt.dart';
import 'package:raha_driver/core/outbox.dart';

Map<String, dynamic> trip(List<String> statuses) => {
      'status': 'to_pickup',
      'checkins': <dynamic>[],
      'loads': [for (var i = 0; i < statuses.length; i++) {'loadId': 'l$i', 'status': statuses[i], 'dropOrder': i + 1}],
    };

QueuedAction act(String type, {String? loadId, Map<String, dynamic> payload = const {}}) => QueuedAction(id: newId(), type: type, tripId: 't', loadId: loadId, at: DateTime.now().toIso8601String(), payload: payload);

void main() {
  test('phone normalisation', () {
    expect(normalizePhone('0911 204 418'), '+251911204418');
    expect(normalizePhone('+251911204418'), '+251911204418');
    expect(normalizePhone('911204418'), '+251911204418');
    expect(normalizePhone('12345'), isNull);
  });

  test('PIN digest check matches sha256(salt:pin)', () {
    const digest = '1755a2d5b309d75bede226f2b6cf858bb14287b917e76ad3b943de0dda4683fb';
    expect(pinMatches('abc', digest, '1234'), isTrue);
    expect(pinMatches('abc', digest, '1235'), isFalse);
    expect(pinMatches('abd', digest, '1234'), isFalse);
  });

  test('step is derived from load statuses', () {
    expect(tripStep(trip(['assigned'])), 1);
    expect(tripStep(trip(['arrived_pickup'])), 2);
    expect(tripStep(trip(['picked_up'])), 3);
    expect(tripStep(trip(['in_transit'])), 4);
    expect(tripStep(trip(['delivered', 'in_transit'])), 4);
    expect(tripStep(trip(['delivered', 'delivered'])), 6);
    expect(tripStep(trip(['picked_up', 'assigned'])), 1);
  });

  test('queued actions are applied on top of the cached trip', () {
    final t = patchTrip(trip(['assigned', 'assigned']), [act('arrive', loadId: 'l0'), act('pickup', loadId: 'l0'), act('arrive', loadId: 'l1'), act('pickup', loadId: 'l1'), act('start')]);
    expect((t['loads'] as List).map((l) => l['status']), ['in_transit', 'in_transit']);
    final done = patchTrip(t, [act('deliver', loadId: 'l0'), act('deliver', loadId: 'l1')]);
    expect(tripStep(done), 6);
    expect(done['status'], 'completed');
  });

  test('money and weight formatting', () {
    expect(etb(14500), '14,500 ETB');
    expect(kg(2000), '2 t');
    expect(kg(850), '850 kg');
  });
}
