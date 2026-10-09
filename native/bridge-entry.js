import {Capacitor,registerPlugin} from '@capacitor/core';
const plugin=registerPlugin('SleepAtlas');
// This entry is only bundled into the iOS copy. The website never loads it.
globalThis.SleepAtlasNative={
  isNative:Capacitor.isNativePlatform(),
  pickImages:options=>plugin.pickImages(options),
  releaseImport:options=>plugin.releaseImport(options),
  shareBackup:options=>plugin.shareBackup(options),
};
