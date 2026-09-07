import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no layout engine, so window.scrollTo just logs "Not implemented".
// Views that scroll to the top on navigation (e.g. the setup wizard) call it.
window.scrollTo = () => {};

afterEach(() => {
	cleanup();
});