/**
 * ParticleSphere — a rotating point-cloud sphere whose surface is displaced by
 * animated 3D simplex noise, rendered as additive-blended glowing dots.
 * Inspired by the WebGL hero on everstride.ch (Three.js point sphere).
 *
 * Pure Three.js + a custom ShaderMaterial: the noise displacement, the blast
 * and the per-dot colouring all happen on the GPU, so it stays smooth.
 * Colours are props so the effect can be themed. When `blast` flips true the
 * dots burst radially outward and fade — used as the loader's exit so the
 * sphere "explodes" just as the app reveals.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";

const NOISE_GLSL = `
vec3 mod289(vec3 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 mod289(vec4 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}`;

const VERT = `
uniform float uTime;
uniform float uSize;
uniform float uFreq;
uniform float uAmp;
uniform float uBlast;
varying float vDisp;
${NOISE_GLSL}
void main(){
  vec3 p = normalize(position);
  float t = uTime * 0.16;
  float n1 = snoise(p * uFreq + vec3(0.0, 0.0, t));
  float n2 = snoise(p * (uFreq * 1.9) + vec3(t * 0.8, t * 0.3, 0.0));
  float disp = n1 * uAmp + n2 * (uAmp * 0.28);
  vDisp = disp;
  // blast: each dot flies outward at its own speed, then fades (see fragment)
  float blastVar = 0.55 + 0.9 * (snoise(p * 3.0) * 0.5 + 0.5);
  float r = 1.0 + disp + uBlast * 3.0 * blastVar;
  vec3 displaced = p * r;
  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (uSize / -mv.z) * (1.0 + uBlast * 1.1);
}`;

const FRAG = `
precision highp float;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uBlast;
varying float vDisp;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float alpha = smoothstep(0.5, 0.06, d) * (1.0 - uBlast * 0.85);
  if (alpha <= 0.001) discard;
  float t = clamp(vDisp * 1.6 + 0.5, 0.0, 1.0);
  vec3 col = mix(uColorA, uColorB, smoothstep(0.0, 0.55, t));
  col = mix(col, uColorC, smoothstep(0.5, 1.0, t));
  gl_FragColor = vec4(col, alpha);
}`;

function toVec3(hex) {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
}

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

export default function ParticleSphere({
  colorA = "#52000e",
  colorB = "#e10018",
  colorC = "#ff6f88",
  size = 15,
  freq = 1.25,
  amp = 0.26,
  blast = false,
  additive = true,
}) {
  const mountRef = useRef(null);
  const clockRef = useRef(null);
  const blastRef = useRef({ active: false, start: 0 });

  // toggle the blast without rebuilding the scene
  useEffect(() => {
    blastRef.current = {
      active: blast,
      start: clockRef.current ? clockRef.current.getElapsedTime() : 0,
    };
  }, [blast]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return; // no WebGL — leave the dark field as-is
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = mount.clientWidth || window.innerWidth;
    let h = mount.clientHeight || window.innerHeight;

    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.z = 4.7;

    const geometry = new THREE.SphereGeometry(1, 116, 82);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: size * dpr },
        uFreq: { value: freq },
        uAmp: { value: amp },
        uBlast: { value: 0 },
        uColorA: { value: toVec3(colorA) },
        uColorB: { value: toVec3(colorB) },
        uColorC: { value: toVec3(colorC) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const clock = new THREE.Clock();
    clockRef.current = clock;
    let raf = 0;

    const computeBlast = (t) => {
      const b = blastRef.current;
      if (!b.active) return 0;
      const x = Math.min((t - b.start) / 2.8, 1); // slow ~2.8s burst
      return easeOutCubic(x);
    };

    const renderFrame = () => {
      const t = clock.getElapsedTime();
      const uB = computeBlast(t);
      material.uniforms.uTime.value = t;
      material.uniforms.uBlast.value = uB;
      points.rotation.y = t * 0.2 + uB * 0.5;
      points.rotation.x = Math.sin(t * 0.13) * 0.18;
      renderer.render(scene, camera);
    };

    const loop = () => {
      renderFrame();
      raf = requestAnimationFrame(loop);
    };

    if (reduce) renderFrame();
    else loop();

    const onResize = () => {
      w = mount.clientWidth || window.innerWidth;
      h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      clockRef.current = null;
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [colorA, colorB, colorC, size, freq, amp, additive]);

  return <div ref={mountRef} className="absolute inset-0" />;
}
