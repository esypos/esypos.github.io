/* Old POS config — OAuth Client ID for Google Sign-In.
   Client ID is not secret (it lives in the browser). Never put Client SECRET here or on GitHub. */
window.PROPOS_CONFIG = {
  googleClientId: '984274944481-2aeko6a7j35s1ghb0lpe9i4sntfc17hr.apps.googleusercontent.com'
  ,
  // EXACT user counter: paste your Firebase Realtime Database URL (no trailing slash), e.g. 'https://your-app-default-rtdb.firebaseio.com'.
  // Publish the rules from firebase-rules.json first. Empty = free public counters (approximate). Steps: README → Live user counter.
  userCounterUrl: '',
  // Added to the Firebase total. When you switch to Firebase, put the number shown today here (e.g. 1250): users already counted before are
  // recorded but NOT added again. With the free counters it can be negative to remove old duplicates (e.g. -120).
  userCountOffset: 0
};
