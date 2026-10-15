import "./SignIn.css";
function SignIn() {
  // Stop the form from refreshing the page.
  function handleSubmit(event) {
    event.preventDefault();
  }

  return (
    <main className="signin-page">
      <section className="signin-card">
        <h1>Welcome back</h1>
        <p>Sign in to view your PRDs.</p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Your password"
            autoComplete="current-password"
            required
          />

          <button type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );
}

export default SignIn;