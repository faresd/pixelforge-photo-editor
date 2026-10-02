import { useCallback, useEffect, useState } from 'react';
import { listCloudProjects, openCloudProject, removeCloudProject, type CloudProject, type Member } from './cloud';
import { saveDraft } from './drafts';

export default function ProjectLibrary({ member }: { member: Member }) {
  const [projects, setProjects] = useState<CloudProject[]>([]);
  const [message, setMessage] = useState('Loading your projects…');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try { const result = await listCloudProjects(); setProjects(result.projects); setMessage(result.projects.length ? '' : 'No cloud projects yet. Open the editor and choose “Save to my projects”.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load projects'); }
  }, []);
  useEffect(() => { void listCloudProjects().then(result => { setProjects(result.projects); setMessage(result.projects.length ? '' : 'No cloud projects yet. Open the editor and choose Save to my projects.'); }).catch(() => setMessage('Could not load cloud projects. Try Refresh projects.')); }, []);
  const open = async (project: CloudProject) => {
    setBusy(true); setMessage('Opening ' + project.name + '…');
    try {
      const result = await openCloudProject(project.id);
      const localId = crypto.randomUUID();
      await saveDraft(localId, { ...result.document, cloud: { id: project.id, generation: result.generation, owner: member.id } });
      location.assign('/editor#draft=' + localId);
    } catch (error) { setBusy(false); setMessage(error instanceof Error ? error.message : 'Could not open project'); }
  };
  const remove = async (project: CloudProject) => {
    if (!confirm('Remove “' + project.name + '” from your cloud library? Local drafts are kept.')) return;
    setBusy(true);
    try { await removeCloudProject(project.id, project.generation); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not remove project'); }
    finally { setBusy(false); }
  };
  return <section className="project-library" aria-labelledby="projects-heading"><div className="home-section-heading"><span className="home-eyebrow">YOUR PRIVATE WORKSPACE</span><h2 id="projects-heading">My projects</h2><p>Welcome, {member.name}. Reopen work saved to your Cheaply account from any device.</p><p>Up to 30 projects · 16 MB per project · Free. Local drafts upload only when you choose to save to this library.</p></div><output>{message}</output><div className="project-grid">{projects.map(project => <article key={project.id}><h3>{project.name || 'Untitled'}</h3><p>Saved {new Date(project.updatedAt).toLocaleString()}</p><div><button disabled={busy} onClick={() => void open(project)}>Continue editing</button><button disabled={busy} onClick={() => void remove(project)}>Remove</button></div></article>)}</div><button className="library-refresh" disabled={busy} onClick={() => void refresh()}>Refresh projects</button></section>;
}
