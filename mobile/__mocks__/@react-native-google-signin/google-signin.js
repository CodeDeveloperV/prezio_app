// Jest manual mock — the real native module isn't registered outside a
// built app, so importing it directly throws in the Jest environment.
module.exports = {
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() =>
      Promise.resolve({ type: 'success', data: { idToken: 'mock-id-token' } }),
    ),
    signOut: jest.fn(() => Promise.resolve()),
  },
};
