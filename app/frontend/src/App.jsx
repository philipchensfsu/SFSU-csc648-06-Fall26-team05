import About from "./components/About";
import SignIn from "./components/SignIn";

function App() {
  // Show the sign-in page at /signin.
  if (window.location.pathname === "/signin") {
    return <SignIn />;
  }

  // Keep the existing About page at the main address.
  return <About />;
}

export default App;