import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/i18n.dart';
import 'core/outbox.dart';
import 'core/session.dart';
import 'core/theme.dart';
import 'core/widgets.dart';
import 'features/auth.dart';
import 'features/home.dart';
import 'features/loads.dart';
import 'features/me.dart';
import 'features/trip.dart';
import 'features/trips.dart';

class _AuthListenable extends ChangeNotifier {
  _AuthListenable(Ref ref) {
    ref.listen(sessionProvider, (_, _) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final auth = _AuthListenable(ref);
  return GoRouter(
    initialLocation: '/home',
    refreshListenable: auth,
    redirect: (context, state) {
      final s = ref.read(sessionProvider).status;
      final loc = state.matchedLocation;
      if (s == AuthStatus.out) return loc == '/login' ? null : '/login';
      if (s == AuthStatus.needsProfile) return loc == '/onboarding' ? null : '/onboarding';
      if (loc == '/login' || loc == '/onboarding') return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/onboarding', builder: (_, _) => const OnboardingScreen()),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => Shell(shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/home', builder: (_, _) => const HomeScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/loads', builder: (_, _) => const LoadsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/trips', builder: (_, _) => const TripsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/earnings', builder: (_, _) => const EarningsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/me', builder: (_, _) => const MeScreen())]),
        ],
      ),
      GoRoute(path: '/load/:id', builder: (_, s) => LoadDetailScreen(s.pathParameters['id']!)),
      GoRoute(path: '/trip/:id', builder: (_, s) => TripScreen(s.pathParameters['id']!)),
      GoRoute(path: '/trip/:id/deliver/:loadId', builder: (_, s) => DeliverScreen(s.pathParameters['id']!, s.pathParameters['loadId']!)),
      GoRoute(path: '/trip/:id/done', builder: (_, s) => TripDoneScreen(s.pathParameters['id']!)),
      GoRoute(path: '/trip/:id/issue', builder: (_, s) => IssueScreen(s.pathParameters['id']!)),
      GoRoute(path: '/return', builder: (_, _) => const ReturnLoadsScreen()),
      GoRoute(path: '/notifications', builder: (_, _) => const NotificationsScreen()),
      GoRoute(path: '/vehicle', builder: (_, _) => const VehicleScreen()),
    ],
  );
});

class RahaApp extends ConsumerWidget {
  const RahaApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(langProvider);
    return MaterialApp.router(title: 'Raha Driver', debugShowCheckedModeBanner: false, theme: buildTheme(), routerConfig: ref.watch(routerProvider));
  }
}

class Shell extends ConsumerWidget {
  const Shell(this.shell, {super.key});
  final StatefulNavigationShell shell;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(outboxProvider); // start the sync queue as soon as the app is signed in
    return Scaffold(
      body: Column(children: [
        const SafeArea(bottom: false, child: SyncBanner()),
        Expanded(child: shell),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: ref.t('Home')),
          NavigationDestination(icon: const Icon(Icons.inventory_2_outlined), selectedIcon: const Icon(Icons.inventory_2), label: ref.t('Loads')),
          NavigationDestination(icon: const Icon(Icons.route_outlined), selectedIcon: const Icon(Icons.route), label: ref.t('Trips')),
          NavigationDestination(icon: const Icon(Icons.payments_outlined), selectedIcon: const Icon(Icons.payments), label: ref.t('Earnings')),
          NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: ref.t('Me')),
        ],
      ),
    );
  }
}

/// Screen scaffold used by all pushed pages: basalt app bar, optional sync banner.
class RPage extends ConsumerWidget {
  const RPage({super.key, required this.title, required this.body, this.actions, this.bottom});
  final String title;
  final Widget body;
  final List<Widget>? actions;
  final Widget? bottom;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
        appBar: AppBar(title: Text(title), actions: actions, backgroundColor: C.basalt),
        body: Column(children: [const SyncBanner(), Expanded(child: body)]),
        bottomNavigationBar: bottom == null ? null : SafeArea(child: Padding(padding: const EdgeInsets.all(16), child: bottom)),
      );
}
