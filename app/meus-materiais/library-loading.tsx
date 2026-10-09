export default function LibraryLoading() {
  return <div className="library-loading" aria-busy="true">
    <p role="status">Consultando seus materiais…</p>
    <div className="library-skeletons" aria-hidden="true">{[1, 2, 3].map(key => <div key={key}><span /><i /><i /></div>)}</div>
  </div>;
}
