import About from "./components/About";
import Prototype from "./prototype/Prototype";

function App() {
  // The prototype starts on the sign-in page, then shows the PRD screens.
  if (window.location.pathname === "/signin") {
    return <Prototype />;
  }

  // Keep the existing About page at the main address.
  return <About />;
}

export default App;