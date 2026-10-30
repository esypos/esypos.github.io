/* Old POS config — OAuth Client ID for Google Sign-In.
   Client ID is not secret (it lives in the browser). Never put Client SECRET here or on GitHub. */
window.PROPOS_CONFIG = {
  googleClientId: '984274944481-2aeko6a7j35s1ghb0lpe9i4sntfc17hr.apps.googleusercontent.com'
  ,
  // Anonymous user counter: paste your Firebase Realtime Database URL (no trailing slash), e.g. 'https://your-app-default-rtdb.firebaseio.com'.
  // Leave empty to hide the counter. Database rules are in README.md.
  userCounterUrl: '',
  // Subtract users counted twice by older versions (they counted every login). Example: userCountOffset: -120
  userCountOffset: 0
};
