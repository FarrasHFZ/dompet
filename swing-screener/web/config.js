// Where the app reads data from. The GitHub Action rebuilds data/latest.json on weekdays after the IDX close.
// To read your own Sheet instead, use the "Source" button in the app (URL + token stay in your browser).
window.SCREENER_CONFIG = {
  SNAPSHOT_URL: 'data/latest.json',
};
