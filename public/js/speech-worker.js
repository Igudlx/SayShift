importScripts('../vendor/mespeak/engine.js');
let configured = false;
const voices = new Set();
async function loadJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('A voice file is missing. Keep the vendor folder when deploying.');
  return response.json();
}
self.onmessage = async ({data}) => {
  try {
    if (!configured) {
      meSpeak.loadConfig(await loadJSON('../vendor/mespeak/config.json'));
      configured = true;
    }
    const voice = data.voice || 'en/en-us';
    if (!voices.has(voice)) {
      meSpeak.loadVoice(await loadJSON(`../vendor/mespeak/voices/${voice}.json`));
      voices.add(voice);
    }
    const wav = meSpeak.speak(data.text, {rawdata:true, amplitude:100, pitch:data.pitch, speed:data.speed, voice, wordgap:0, ssml:false});
    if (!wav || wav.byteLength < 44) throw new Error('The speech engine could not read that text. Try a shorter phrase.');
    self.postMessage({type:'done', wav}, [wav]);
  } catch (error) { self.postMessage({type:'error', message:error.message || 'Speech generation failed.'}); }
};
