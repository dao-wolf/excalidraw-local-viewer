// Saving inside the Claude app's browser pane.
//
// Found 3 Nov 2026, with the checks in tools/check_saved.py:
//  1. In the pane, window.showSaveFilePicker exists but rejects at once with AbortError. Excalidraw treats that
//     as "the user cancelled" and shows nothing. Removing the pickers makes it fall back to a plain download.
//  2. The pane silently drops a download whose file name already exists in the folder (no overwrite, no "(1)").
//     So in download mode every file name gets a time stamp.
//
// Mode: the Claude pane (user agent contains "Claude/") downloads. Override with ?save=download or ?save=picker.
// Other browsers keep the native save panel.
(function () {
  var save = new URLSearchParams(location.search).get('save');
  var inPane = /Claude\//.test(navigator.userAgent);
  var useDownload = save === 'download' || (inPane && save !== 'picker');
  document.documentElement.setAttribute('data-save-mode', useDownload ? 'download' : 'picker');
  if (!useDownload) return;

  delete window.showSaveFilePicker;
  delete window.showOpenFilePicker;

  function two(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(name) {
    var d = new Date();
    var t = d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '-' + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds());
    var dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) + '-' + t + name.slice(dot) : name + '-' + t;
  }
  var click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) this.download = stamp(this.download);
    return click.apply(this, arguments);
  };
})();
