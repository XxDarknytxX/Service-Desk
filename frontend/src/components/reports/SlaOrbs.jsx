/**
 * SlaOrbs — a Three.js "severity constellation" for SLA violations.
 *
 * One glowing orb per team: size ∝ violation volume, colour ∝ severity (worst
 * overdue). The cluster slowly rotates and breathes; hovering an orb shows a
 * tooltip and clicking it drills the report into that team. Purely a
 * visualization layer — the drill-down list below is the source of truth.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

const fmtShort = (ms) => {
  const m = Math.round(Math.abs(ms || 0) / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};
// amber → orange → rose → deep red as overdue grows
const sevColor = (hrs) => (hrs >= 12 ? "#dc2626" : hrs >= 4 ? "#f43f5e" : hrs >= 1 ? "#fb923c" : "#fbbf24");

export default function SlaOrbs({ teams = [], activeId = null, onSelect }) {
  const mountRef = useRef(null);
  const tipRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const activeRef = useRef(activeId);
  onSelectRef.current = onSelect;
  activeRef.current = activeId;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !teams.length) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = mount.clientWidth || 640;
    let h = mount.clientHeight || 208;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0.3, 6.2);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const pl = new THREE.PointLight(0xffffff, 1.1);
    pl.position.set(3, 4, 6);
    scene.add(pl);

    const group = new THREE.Group();
    scene.add(group);
    const maxCount = Math.max(1, ...teams.map((t) => t.count));
    const n = teams.length;
    const R = n > 1 ? 2.5 : 0;
    const orbs = [];
    teams.forEach((t, i) => {
      const hrs = (t.worst || 0) / 3.6e6;
      const color = new THREE.Color(sevColor(hrs));
      const radius = 0.36 + 0.6 * Math.sqrt(t.count / maxCount);
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(ang) * R;
      const y = Math.sin(ang) * R * 0.4;
      const z = Math.cos(ang * 2) * 0.4;
      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(radius, 4),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.15 })
      );
      core.position.set(x, y, z);
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.55, 24, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      core.add(halo);
      core.userData = { team: t, baseR: radius };
      group.add(core);
      orbs.push(core);
    });

    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    let hovered = null;
    const el = renderer.domElement;
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(ptr, camera);
      const hit = ray.intersectObjects(orbs, false)[0];
      hovered = hit ? hit.object : null;
      el.style.cursor = hovered ? "pointer" : "default";
      const tip = tipRef.current;
      if (tip) {
        if (hovered) {
          const t = hovered.userData.team;
          tip.style.opacity = "1";
          tip.style.left = `${e.clientX - rect.left}px`;
          tip.style.top = `${e.clientY - rect.top}px`;
          tip.innerHTML = `<div style="font-weight:600">${t.name}</div><div style="opacity:.8">${t.count} violation${t.count !== 1 ? "s" : ""} · ${fmtShort(t.overdue)} overdue</div>`;
        } else {
          tip.style.opacity = "0";
        }
      }
    };
    const onClick = () => {
      if (hovered && onSelectRef.current) onSelectRef.current(hovered.userData.team.id);
    };
    const onLeave = () => {
      hovered = null;
      if (tipRef.current) tipRef.current.style.opacity = "0";
      el.style.cursor = "default";
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("click", onClick);
    el.addEventListener("pointerleave", onLeave);

    const clock = new THREE.Clock();
    let raf = 0;
    const frame = () => {
      const tm = clock.getElapsedTime();
      group.rotation.y = tm * 0.1;
      orbs.forEach((o, i) => {
        const isActive = activeRef.current != null && String(o.userData.team.id) === String(activeRef.current);
        const pulse = 1 + Math.sin(tm * 1.5 + i * 0.7) * 0.045;
        const boost = o === hovered ? 1.28 : isActive ? 1.16 : 1;
        o.scale.setScalar(pulse * boost);
        o.material.emissiveIntensity = 0.45 + (o === hovered || isActive ? 0.45 : 0);
        o.rotation.y = -group.rotation.y + tm * 0.18;
      });
      renderer.render(scene, camera);
    };
    const loop = () => {
      frame();
      raf = requestAnimationFrame(loop);
    };
    if (reduce) frame();
    else loop();

    const onResize = () => {
      w = mount.clientWidth || 640;
      h = mount.clientHeight || 208;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("click", onClick);
      el.removeEventListener("pointerleave", onLeave);
      orbs.forEach((o) => {
        o.geometry.dispose();
        o.material.dispose();
        o.children.forEach((c) => {
          c.geometry?.dispose?.();
          c.material?.dispose?.();
        });
      });
      renderer.dispose();
      if (el.parentNode === mount) mount.removeChild(el);
    };
  }, [teams]);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="absolute inset-0" />
      <div
        ref={tipRef}
        className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[150%] px-2.5 py-1.5 rounded-lg text-[11px] leading-tight bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-elevated)] text-[var(--fg-primary)] opacity-0 transition-opacity duration-150 whitespace-nowrap"
      />
    </div>
  );
}
