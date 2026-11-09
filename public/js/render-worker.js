import { renderVocoder } from './dsp.js';
self.onmessage = ({data}) => {
  try {
    const samples = renderVocoder(data, progress => self.postMessage({type:'progress', progress}));
    self.postMessage({type:'done', samples}, [samples.buffer]);
  } catch (error) { self.postMessage({type:'error', message:error.message || 'Audio processing failed.'}); }
};
