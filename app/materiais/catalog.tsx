"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, ShoppingCart, Plus, BookOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SELECTION_KEY, SELECTION_LIMIT, parseSelection, serializeSelection, type Material, type MaterialState } from "@/lib/catalog-selection";

async function checkSelection(ids: string[], signal?: AbortSignal): Promise<{ states: Record<string, MaterialState>; cartIds?: string[] }> {
  const response = await fetch("/api/catalog/selection", {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
    body: JSON.stringify({ ids: [...new Set(ids)] }), signal: signal || AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Não foi possível conferir os materiais. Tente novamente.");
  return await response.json();
}

function Cover({ material }: { material: Material }) {
  const [failed, setFailed] = useState(false);
  return <div className="catalog-cover">{material.image_url && !failed
    ? <Image src={material.image_url} alt={`Capa de ${material.name}`} fill sizes="(max-width: 760px) 90vw, (max-width: 1050px) 45vw, 370px" onError={() => setFailed(true)} />
    : <div className="catalog-cover-fallback"><BookOpen size={44} aria-hidden="true" /><span>Teorema <em>da Educação</em></span></div>}
    <span className="catalog-format">Material digital · PDF</span>
  </div>;
}

export default function Catalog({ materials, selectionEnabled, cartEnabled = false }: { materials: Material[]; selectionEnabled: boolean; cartEnabled?: boolean }) {
  const [ids, setIds] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [states, setStates] = useState<Record<string, MaterialState>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [refresh, setRefresh] = useState(0);
  const memory = useRef<string[]>([]);
  const storageBlocked = useRef(false);
  const pending = useRef(false);
  const read = useCallback(() => {
    if (storageBlocked.current) return memory.current;
    try { memory.current = parseSelection(localStorage.getItem(SELECTION_KEY)); return memory.current; }
    catch { storageBlocked.current = true; setStorageWarning("O navegador não permitiu salvar a seleção. Ela será mantida apenas nesta página."); return memory.current; }
  }, []);
  const save = useCallback((next: string[]) => {
    memory.current = next;
    try { if (!storageBlocked.current) localStorage.setItem(SELECTION_KEY, serializeSelection(next)); }
    catch { storageBlocked.current = true; setStorageWarning("O navegador não permitiu salvar a seleção. Ela será mantida apenas nesta página."); }
    setIds(next);
  }, []);

  useEffect(() => {
    if (!selectionEnabled) return;
    setIds(read()); setReady(true);
    const sync = (event: StorageEvent) => { if (event.key === SELECTION_KEY || event.key === null) setIds(read()); };
    const focus = () => { setIds(read()); setRefresh(value => value + 1); };
    window.addEventListener("storage", sync); window.addEventListener("focus", focus);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("focus", focus); };
  }, [read, selectionEnabled]);

  const requested = JSON.stringify([...new Set([...materials.map(material => material.id), ...ids])]);
  useEffect(() => {
    if (!selectionEnabled || !ready) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let current = true;
    setStates({});
    checkSelection(JSON.parse(requested), controller.signal).then(result => {
      if (current) { setStates(result.states); setSavedIds(result.cartIds || []); setError(""); }
    }).catch(() => { if (current) setError("Não foi possível conferir os materiais. Sua seleção foi preservada."); });
    return () => { current = false; clearTimeout(timeout); controller.abort(); };
  }, [requested, ready, refresh, selectionEnabled]);

  async function add(material: Material) {
    if (pending.current) return;
    pending.current = true; setBusy(material.id); setError("");
    try {
      const result = await checkSelection([material.id]);
      setStates(previous => ({ ...previous, ...result.states })); setSavedIds(result.cartIds || []);
      if (result.cartIds?.includes(material.id)) { setMessage("Este material já está salvo no seu carrinho."); return; }
      if (result.states[material.id] !== "available") { setMessage(result.states[material.id] === "owned" ? "Este material já está disponível na sua biblioteca." : "Este material não está mais disponível para compra."); return; }
      const update = () => {
        const latest = read();
        if (latest.includes(material.id)) { setIds(latest); setMessage("Este material já foi adicionado."); return; }
        if (latest.length >= SELECTION_LIMIT) { setError(`Você pode selecionar até ${SELECTION_LIMIT} materiais.`); return; }
        save([...latest, material.id]); setMessage(`${material.name} adicionado ao carrinho.`);
      };
      if (navigator.locks) await navigator.locks.request(SELECTION_KEY, update); else update();
    } catch { setError("Não foi possível adicionar o material. Tente novamente."); }
    finally { pending.current = false; setBusy(null); }
  }

  async function remove(id: string) {
    const update = () => { save(read().filter(value => value !== id)); setMessage("Material removido da seleção."); };
    if (navigator.locks) await navigator.locks.request(SELECTION_KEY, update); else update();
  }

  const blocked = ids.filter(id => states[id] && states[id] !== "available");
  const count = new Set([...ids, ...savedIds]).size;
  return <>
    {selectionEnabled && <aside className="catalog-selection" aria-label="Sua seleção">
      <div><ShoppingCart size={22} aria-hidden="true" /><strong>{count} {count === 1 ? "material selecionado" : "materiais selecionados"}</strong></div>
      <Link href="/carrinho" className="catalog-cart-link">Ir para o carrinho <span aria-hidden="true">↗</span></Link>
      <p>{cartEnabled ? "Revise os materiais no carrinho. Entre na sua conta para salvar sua seleção." : "Prévia da seleção. O carrinho e a finalização serão disponibilizados na próxima etapa."}</p>
    </aside>}
    <p className="catalog-feedback" role="status" aria-live="polite">{message}</p>
    {storageWarning && <p className="catalog-notice" role="status">{storageWarning}</p>}
    {error && <div className="catalog-notice" role="alert">{error} <button onClick={() => setRefresh(value => value + 1)}>Tentar novamente</button></div>}
    {blocked.length > 0 && <div className="catalog-notice">{blocked.length} {blocked.length === 1 ? "item da seleção está indisponível ou já foi adquirido" : "itens da seleção estão indisponíveis ou já foram adquiridos"}.
      <button onClick={async () => { for (const id of blocked) await remove(id); }}>Remover esses itens</button></div>}
    <div className="materials-grid catalog-grid">
      {materials.map(material => {
        const local = ids.includes(material.id), selected = local || savedIds.includes(material.id), state = states[material.id];
        const label = busy === material.id ? "Conferindo..." : state === "owned" ? "Já adquirido" : state === "unavailable" ? "Indisponível" : selected ? "Adicionado" : !state ? "Conferindo..." : "Adicionar ao carrinho";
        return <article className="catalog-product" key={material.id}>
          <Cover material={material} />
          <div className="catalog-product-body"><h3>{material.name}</h3><p className="catalog-description">{material.description}</p>
            <div className="catalog-product-bottom"><span className="catalog-price">{material.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              {selectionEnabled ? <><button className="catalog-add" disabled={!ready || !!busy || !state || state !== "available" || selected} onClick={() => add(material)} aria-label={`${label}: ${material.name}`}>
                {selected ? <Check size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}{label}</button>
                {state === "owned" && <p className="catalog-owned">Já disponível na sua biblioteca.</p>}
                {local ? <button className="catalog-remove" onClick={() => remove(material.id)} aria-label={`Remover ${material.name} da seleção`}>Remover da seleção</button> : selected ? <Link className="catalog-remove" href="/carrinho">Gerenciar no carrinho</Link> : null}</>
                : <a className="catalog-add" href={`https://wa.me/5548935011911?text=${encodeURIComponent(`Olá! Tenho interesse no material ${material.name} e gostaria de saber como adquirir.`)}`} target="_blank" rel="noreferrer">Consultar pelo WhatsApp <span aria-hidden="true">↗</span></a>}
            </div>
          </div>
        </article>;
      })}
    </div>
  </>;
}
