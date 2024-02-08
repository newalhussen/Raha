import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'session.dart';

class LangNotifier extends Notifier<String> {
  @override
  String build() => ref.read(prefsProvider).getString('lang') ?? 'en';
  void set(String l) {
    state = l;
    ref.read(prefsProvider).setString('lang', l);
  }
}

final langProvider = NotifierProvider<LangNotifier, String>(LangNotifier.new);

extension Tr on WidgetRef {
  /// Translate a UI string. English is the key itself; Amharic comes from [_am].
  String t(String en) => watch(langProvider) == 'am' ? (_am[en] ?? en) : en;
}

const _am = <String, String>{
  'Welcome to Raha': 'እንኳን ወደ ራሃ በደህና መጡ',
  'Enter your phone number': 'ስልክ ቁጥርዎን ያስገቡ',
  'Phone number': 'ስልክ ቁጥር',
  'Send code': 'ኮድ ላክ',
  'Enter the 6-digit code': 'ባለ 6 አሃዝ ኮዱን ያስገቡ',
  'Sign in': 'ግባ',
  'Resend code': 'ኮዱን እንደገና ላክ',
  'Your name': 'ስምዎ',
  'Full name': 'ሙሉ ስም',
  'Licence number': 'የመንጃ ፈቃድ ቁጥር',
  'Licence grade': 'የፈቃድ ደረጃ',
  'Continue': 'ቀጥል',
  'Home': 'መነሻ',
  'Loads': 'ጭነቶች',
  'Trips': 'ጉዞዎች',
  'Earnings': 'ገቢ',
  'Me': 'እኔ',
  'Available': 'ዝግጁ ነኝ',
  'Not available': 'ዝግጁ አይደለሁም',
  'Today\'s route': 'የዛሬ መስመር',
  'Free space': 'ነፃ ቦታ',
  'Loaded': 'የተጫነ',
  'This week': 'በዚህ ሳምንት',
  'Trips done': 'የተጠናቀቁ ጉዞዎች',
  'Continue trip': 'ጉዞውን ቀጥል',
  'See loads': 'ጭነቶችን እይ',
  'Loads on your route': 'በመስመርዎ ላይ ያሉ ጭነቶች',
  'On route': 'በመስመር',
  'Near me': 'አጠገቤ',
  'All': 'ሁሉም',
  'BEST FIT': 'በጣም ተስማሚ',
  'Pickup': 'መጫኛ',
  'Drop-off': 'ማራገፊያ',
  'Weight': 'ክብደት',
  'You earn': 'የሚያገኙት',
  'Accept load': 'ጭነቱን ተቀበል',
  'Decline': 'አልቀበልም',
  'Load accepted': 'ጭነቱ ተቀብሏል',
  'Open trip': 'ጉዞውን ክፈት',
  'Waiting for the shipper to confirm': 'ላኪው እስኪያረጋግጥ በመጠበቅ ላይ',
  'Active': 'በሂደት ላይ',
  'Completed': 'የተጠናቀቁ',
  'No trips yet': 'እስካሁን ጉዞ የለም',
  'Start trip': 'ጉዞ ጀምር',
  'Begin trip': 'ወደ መጫኛ ጉዞ ጀምር',
  'I have arrived': 'ደርሻለሁ',
  'Confirm pickup': 'መጫኑን አረጋግጥ',
  'Cargo counted': 'ጭነቱ ተቆጥሯል',
  'No visible damage': 'ጉዳት የለም',
  'Waybill received': 'ደረሰኝ ተቀብያለሁ',
  'Take photo of the loaded cargo': 'የተጫነውን ጭነት ፎቶ ያንሱ',
  'Retake photo': 'ፎቶውን እንደገና አንሳ',
  'Check in': 'ተመዝግቤያለሁ',
  'Check in at': 'የምዝገባ ቦታ',
  'Enter delivery PIN': 'የርክክብ ፒን ያስገቡ',
  'Ask the receiver for the 4-digit PIN': 'ተቀባዩን ባለ 4 አሃዝ ፒን ይጠይቁ',
  'Confirm delivery': 'ርክክቡን አረጋግጥ',
  'All good': 'ሁሉም ደህና',
  'Short count': 'ጉድለት አለ',
  'Damaged': 'ተጎድቷል',
  'Pieces received': 'የተቀበሉት ብዛት',
  'Photo of delivered cargo': 'የደረሰው ጭነት ፎቶ',
  'Wrong PIN': 'ፒኑ ልክ አይደለም',
  'Trip complete': 'ጉዞው ተጠናቀቀ',
  'Your payment': 'ክፍያዎ',
  'Back to home': 'ወደ መነሻ ተመለስ',
  'Find a return load': 'የመልስ ጭነት ፈልግ',
  'Report a problem': 'ችግር አሳውቅ',
  'Waiting to send': 'ለመላክ እየጠበቀ ነው',
  'No signal — saved on your phone': 'ኔትወርክ የለም — በስልክዎ ተቀምጧል',
  'Sent': 'ተልኳል',
  'Week': 'ሳምንት',
  'Month': 'ወር',
  'Year': 'ዓመት',
  'Paid': 'ተከፍሏል',
  'Pending': 'በመጠበቅ ላይ',
  'Documents': 'ሰነዶች',
  'Language': 'ቋንቋ',
  'Call support': 'ድጋፍ ደውል',
  'Sign out': 'ውጣ',
  'My truck': 'የእኔ መኪና',
  'Update loaded weight': 'የተጫነውን ክብደት አዘምን',
  'Save': 'አስቀምጥ',
  'Notifications': 'ማሳወቂያዎች',
  'Nothing here yet': 'እስካሁን ምንም የለም',
  'Return loads': 'የመልስ ጭነቶች',
  'Alert me about return loads': 'ስለ መልስ ጭነቶች አሳውቀኝ',
  'Retry': 'እንደገና ሞክር',
  'Cancel': 'ተው',
  'Next': 'ቀጣይ',
  'Done': 'ተጠናቀቀ',
};
