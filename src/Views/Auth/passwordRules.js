// Matches the project's Auth settings (minimum length 8, letters and
// digits). Supabase enforces the real rule; this only gives a clear message
// before the round trip.
export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters, with letters and numbers.`;

// '' when the password is acceptable, otherwise what to fix.
export const passwordProblem = (password = '') => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (!/[a-z]/i.test(password) || !/\d/.test(password)) {
    return 'Password must include both letters and numbers.';
  }

  return '';
};
