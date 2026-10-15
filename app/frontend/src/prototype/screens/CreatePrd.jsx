function CreatePrd({ projects, onCreate, onCancel }) {
  function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onCreate({
      title: form.get("title").trim(),
      projectId: form.get("project") || null,
    });
  }

  return (
    <main className="nt-main nt-narrow nt-split">
      <section className="nt-card">
        <h1>Create a PRD</h1>
        <p className="nt-muted">
          Give your PRD a title. Then a short interview collects what it needs.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="nt-field">
            <label htmlFor="title">
              PRD title <span className="nt-req">(Required)</span>
            </label>
            <input id="title" name="title" required autoFocus />
          </div>
          <div className="nt-field">
            <label htmlFor="project">
              Project <span className="nt-req">(Optional)</span>
            </label>
            <select id="project" name="project" aria-describedby="project-help">
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <p id="project-help" className="nt-help">
              A project is an optional folder. Your PRD can also live on its own.
            </p>
          </div>
          <div className="nt-actions">
            <button type="submit" className="nt-btn nt-btn-primary">
              Start discovery interview
            </button>
            <button type="button" className="nt-btn nt-btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </section>

      <aside className="nt-card nt-next-steps" aria-labelledby="next-steps">
        <h2 id="next-steps" className="nt-eyebrow">
          What happens next
        </h2>
        <ol>
          <li>
            <strong>Discovery interview</strong>
            <span>Answer guided questions about your idea.</span>
          </li>
          <li>
            <strong>Review answers</strong>
            <span>Check and edit them before generating.</span>
          </li>
          <li>
            <strong>Generate and edit</strong>
            <span>AI drafts your PRD. Edit it and save it to your account.</span>
          </li>
        </ol>
      </aside>
    </main>
  );
}

export default CreatePrd;
