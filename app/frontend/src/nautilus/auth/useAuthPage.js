import { useEffect } from 'react';
import { ensureFonts } from '../page.js';

// The fonts (once per document) and the tab title; a title of null leaves the tab title alone.
export default function useAuthPage(title) {
  useEffect(() => {
    ensureFonts();
    if (title !== null) document.title = title;
  }, [title]);
}
