import * as THREE from 'three';

// Sky, sun/moon, light, fog, clouds, stars and rain. The look follows the hour of the day and the weather, and glides
// from one to the next. "Auto" uses the player's own clock (so at 2 pm it is day) and a weather that changes every few hours.

export type Weather = 'clear' | 'cloudy' | 'rain' | 'fog';
export interface EnvSetting {
  /** 'auto' = the player's clock, or an hour of the day (0 to 24) */
  time: 'auto' | number;
  weather: 'auto' | Weather;
}

export const WEATHER_LABEL: Record<Weather, string> = { clear: 'Despejado', cloudy: 'Nublado', rain: 'Lluvia', fog: 'Neblina' };

interface Look {
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  fog: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  sun: THREE.Color;
  sunI: number;
  fogNear: number;
  fogFar: number;
  /** 0 = broad daylight, 1 = deep night: drives windows, lamps, stars, neon */
  night: number;
  cloud: number;
  cloudColor: THREE.Color;
  stars: number;
  rain: number;
}

const col = (hex: string) => new THREE.Color(hex);
const blank = (): Look => ({
  skyTop: col('#000'), skyBottom: col('#000'), fog: col('#000'), hemiSky: col('#000'), hemiGround: col('#000'), hemiI: 1,
  sun: col('#fff'), sunI: 1, fogNear: 60, fogFar: 300, night: 0, cloud: 0.3, cloudColor: col('#fff'), stars: 0, rain: 0,
});

type KeySpec = { h: number; skyTop: string; skyBottom: string; fog: string; hemiSky: string; hemiGround: string; hemiI: number; sun: string; sunI: number; night: number };
const KEYS: KeySpec[] = [
  { h: 0, skyTop: '#060a22', skyBottom: '#1c1856', fog: '#171a4a', hemiSky: '#7384ee', hemiGround: '#20143c', hemiI: 1.35, sun: '#a9b9ff', sunI: 0.9, night: 1 },
  { h: 5, skyTop: '#101850', skyBottom: '#40306e', fog: '#2c2a62', hemiSky: '#7f8ee8', hemiGround: '#2a1a40', hemiI: 1.3, sun: '#a9b9ff', sunI: 0.8, night: 0.92 },
  { h: 7, skyTop: '#4f6cc0', skyBottom: '#ffb690', fog: '#cf97a2', hemiSky: '#b8c0ff', hemiGround: '#503040', hemiI: 1.7, sun: '#ffc592', sunI: 1.9, night: 0.3 },
  { h: 10, skyTop: '#3a8aea', skyBottom: '#d4ecff', fog: '#cfe5f8', hemiSky: '#dcecff', hemiGround: '#7e8e7e', hemiI: 2.2, sun: '#fff6e4', sunI: 2.9, night: 0 },
  { h: 15, skyTop: '#3a8aea', skyBottom: '#d4ecff', fog: '#cfe5f8', hemiSky: '#dcecff', hemiGround: '#7e8e7e', hemiI: 2.2, sun: '#fff6e4', sunI: 2.9, night: 0 },
  { h: 17.5, skyTop: '#4c6ed4', skyBottom: '#ffc496', fog: '#e4b496', hemiSky: '#ecd4e6', hemiGround: '#6e4e54', hemiI: 1.9, sun: '#ffb272', sunI: 2.3, night: 0.08 },
  { h: 19, skyTop: '#42328e', skyBottom: '#ff7c58', fog: '#aa627c', hemiSky: '#bca4ec', hemiGround: '#42294f', hemiI: 1.55, sun: '#ff9c6c', sunI: 1.5, night: 0.6 },
  { h: 21, skyTop: '#0e123c', skyBottom: '#34226e', fog: '#241f58', hemiSky: '#7f8eee', hemiGround: '#22163e', hemiI: 1.4, sun: '#a9b9ff', sunI: 0.9, night: 1 },
  { h: 24, skyTop: '#060a22', skyBottom: '#1c1856', fog: '#171a4a', hemiSky: '#7384ee', hemiGround: '#20143c', hemiI: 1.35, sun: '#a9b9ff', sunI: 0.9, night: 1 },
];

const smooth = (t: number) => t * t * (3 - 2 * t);

function lookAtHour(hour: number, out: Look): void {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = smooth((h - a.h) / (b.h - a.h));
  const mix = (x: string, y: string, c: THREE.Color) => c.set(x).lerp(col(y), t);
  mix(a.skyTop, b.skyTop, out.skyTop);
  mix(a.skyBottom, b.skyBottom, out.skyBottom);
  mix(a.fog, b.fog, out.fog);
  mix(a.hemiSky, b.hemiSky, out.hemiSky);
  mix(a.hemiGround, b.hemiGround, out.hemiGround);
  mix(a.sun, b.sun, out.sun);
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * t;
  out.sunI = a.sunI + (b.sunI - a.sunI) * t;
  out.night = a.night + (b.night - a.night) * t;
}

/** Weather bends the look of the hour: greyer, dimmer, closer fog. */
function applyWeather(w: Weather, out: Look): void {
  const grey = col('#8e96aa').lerp(col('#1d2138'), out.night);
  out.cloud = 0.25;
  out.rain = 0;
  out.stars = Math.max(0, out.night * 1.2 - 0.2);
  out.fogNear = 70;
  out.fogFar = 270;
  out.cloudColor.set('#ffffff').lerp(col('#2a3058'), out.night);
  if (w === 'cloudy') {
    out.skyTop.lerp(grey, 0.55);
    out.skyBottom.lerp(grey, 0.6);
    out.fog.lerp(grey, 0.5);
    out.sunI *= 0.42;
    out.hemiI *= 0.96;
    out.cloud = 1;
    out.stars *= 0.15;
    out.cloudColor.lerp(grey, 0.35);
  } else if (w === 'rain') {
    const dark = grey.clone().multiplyScalar(0.7);
    out.skyTop.lerp(dark, 0.8);
    out.skyBottom.lerp(dark, 0.8);
    out.fog.lerp(dark, 0.7);
    out.sunI *= 0.22;
    out.hemiI *= 0.86;
    out.cloud = 1;
    out.rain = 1;
    out.stars = 0;
    out.fogNear = 28;
    out.fogFar = 150;
    out.cloudColor.lerp(dark, 0.7);
  } else if (w === 'fog') {
    out.skyTop.lerp(out.fog, 0.8);
    out.skyBottom.lerp(out.fog, 0.9);
    out.sunI *= 0.5;
    out.cloud = 0.4;
    out.stars *= 0.1;
    out.fogNear = 10;
    out.fogFar = 70;
  }
}

function copyLook(from: Look, to: Look, k: number): void {
  for (const key of ['skyTop', 'skyBottom', 'fog', 'hemiSky', 'hemiGround', 'sun', 'cloudColor'] as const) to[key].lerp(from[key], k);
  for (const key of ['hemiI', 'sunI', 'fogNear', 'fogFar', 'night', 'cloud', 'stars', 'rain'] as const) to[key] += (from[key] - to[key]) * k;
}

/** Weather for "auto": changes every 3 hours, the same for everyone at the same moment. */
export function autoWeather(date = new Date()): Weather {
  const block = Math.floor(date.getTime() / (3 * 3600 * 1000));
  let s = (block * 2654435761) >>> 0;
  s = (s ^ (s >>> 15)) >>> 0;
  const r = (s % 1000) / 1000;
  return r < 0.65 ? 'clear' : r < 0.88 ? 'cloudy' : 'rain'; // no fog: it hid the city
}

function hourNow(date = new Date()): number {
  return date.getHours() + date.getMinutes() / 60;
}

interface Rig {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
}

export class Environment {
  setting: EnvSetting = { time: 'auto', weather: 'auto' };
  /**
   * Online, the sky belongs to the city: this is how far the server's clock is from ours (ms), and the hour and the
   * weather come from it, the same for every player. Null while playing alone.
   */
  cityOffsetMs: number | null = null;
  /** called with the current night amount (0 day .. 1 night) whenever it changes noticeably */
  onNight: ((night: number) => void) | null = null;
  /** called with how hard it rains (0..1) when that changes: the ground gets wet */
  onWet: ((wet: number) => void) | null = null;

  private cur = blank();
  private tgt = blank();
  private first = true;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private sunDisc: THREE.Mesh;
  private moonDisc: THREE.Mesh;
  private clouds: THREE.Group;
  private cloudMats: THREE.MeshBasicMaterial[] = [];
  private rainLines: THREE.LineSegments;
  /** rain, clouds and stars on or off (low quality turns them off) */
  weatherFx = true;
  private lastNight = -1;
  private lastWet = -1;
  private hour = 12;
  private weather: Weather = 'clear';

  constructor(private scene: THREE.Scene, private rig: Rig) {
    scene.fog = new THREE.Fog('#cfe5f8', 90, 340);

    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
      vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 top;',
        'uniform vec3 bottom;',
        'varying float vY;',
        'void main() {',
        '  float t = smoothstep(-0.08, 0.7, vY);',
        '  gl_FragColor = vec4(mix(bottom, top, t), 1.0);',
        '#include <tonemapping_fragment>',
        '#include <colorspace_fragment>',
        '}',
      ].join('\n'),
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(520, 24, 16), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    const starPts: number[] = [];
    for (let i = 0; i < 500; i++) {
      const u = Math.random();
      const v = Math.random() * 0.9 + 0.1;
      const th = u * Math.PI * 2;
      const r = 480;
      const s = Math.sqrt(1 - v * v);
      starPts.push(r * s * Math.cos(th), r * v, r * s * Math.sin(th));
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    const disc = (color: number, r: number) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color, fog: false, transparent: true }));
      m.frustumCulled = false;
      m.material.userData.outlineParameters = { visible: false };
      scene.add(m);
      return m;
    };
    this.sunDisc = disc(0xfff1c0, 16);
    this.moonDisc = disc(0xdfe6ff, 11);

    this.clouds = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false, depthWrite: false });
      mat.userData.outlineParameters = { visible: false };
      this.cloudMats.push(mat);
      const puffs = 4 + (i % 3);
      for (let k = 0; k < puffs; k++) {
        const p = new THREE.Mesh(new THREE.IcosahedronGeometry(7 + ((i * 7 + k * 3) % 5), 1), mat);
        p.position.set(k * 9 - puffs * 4, ((k * 5) % 3) * 1.5, ((k * 7) % 4) * 3);
        p.scale.set(1.3, 0.55, 0.9);
        g.add(p);
      }
      const ang = (i / 16) * Math.PI * 2 + i;
      const dist = 140 + ((i * 37) % 200);
      g.position.set(Math.cos(ang) * dist, 70 + ((i * 13) % 40), Math.sin(ang) * dist);
      g.userData.speed = 1.2 + (i % 4) * 0.5;
      g.userData.base = 0.4 + (i % 5) * 0.12;
      this.clouds.add(g);
    }
    scene.add(this.clouds);

    const rain: number[] = [];
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < 1100; i++) {
        const x = (Math.random() - 0.5) * 90;
        const z = (Math.random() - 0.5) * 90;
        const y = Math.random() * 34 + k * 34;
        rain.push(x, y, z, x - 0.3, y - 1.8, z);
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rain, 3));
    this.rainLines = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xd2dcff, transparent: true, opacity: 0, fog: false }));
    this.rainLines.frustumCulled = false;
    scene.add(this.rainLines);

    // look "now" without a transition on the very first frame
    this.refreshTarget();
    copyLook(this.tgt, this.cur, 1);
  }

  apply(s: EnvSetting): void {
    this.setting = { ...s };
  }

  /** What the sky is doing right now, for the HUD. */
  describe(): { hour: number; weather: Weather; night: number } {
    return { hour: this.hour, weather: this.weather, night: this.cur.night };
  }

  private refreshTarget(): void {
    if (this.cityOffsetMs !== null) {
      const d = new Date(Date.now() + this.cityOffsetMs);
      this.hour = ((d.getUTCHours() - 5 + 24) % 24) + d.getUTCMinutes() / 60; // the city keeps Colombia's time
      this.weather = autoWeather(d);
    } else {
      this.hour = this.setting.time === 'auto' ? hourNow() : this.setting.time;
      this.weather = this.setting.weather === 'auto' ? autoWeather() : this.setting.weather;
    }
    lookAtHour(this.hour, this.tgt);
    applyWeather(this.weather, this.tgt);
  }

  update(dt: number, time: number, camera: THREE.Camera, target: THREE.Vector3): void {
    this.refreshTarget();
    copyLook(this.tgt, this.cur, this.first ? 1 : 1 - Math.exp(-dt * 1.6));
    this.first = false;
    const c = this.cur;

    this.skyMat.uniforms.top.value.copy(c.skyTop);
    this.skyMat.uniforms.bottom.value.copy(c.skyBottom);
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.min(1, c.stars);

    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(c.fog);
    fog.near = c.fogNear;
    fog.far = c.fogFar;

    this.rig.hemi.color.copy(c.hemiSky);
    this.rig.hemi.groundColor.copy(c.hemiGround);
    this.rig.hemi.intensity = c.hemiI;

    // sun by day, moon by night: one light that travels across the sky
    const a = ((this.hour - 6) / 12) * Math.PI;
    const dir = new THREE.Vector3(Math.cos(a) * 0.9, Math.sin(a), 0.55).normalize();
    const isDay = dir.y > 0;
    const lightDir = isDay ? dir : dir.clone().multiplyScalar(-1);
    lightDir.y = Math.max(0.22, lightDir.y);
    this.rig.sun.position.copy(target).addScaledVector(lightDir.normalize(), 60);
    this.rig.sun.target.position.copy(target);
    this.rig.sun.color.copy(c.sun);
    this.rig.sun.intensity = c.sunI;

    const show = (m: THREE.Mesh, d: THREE.Vector3, visible: boolean, k: number) => {
      m.position.copy(camera.position).addScaledVector(d, 420);
      m.visible = visible && k > 0.02;
      (m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, k);
    };
    const clear = this.weather === 'clear' ? 1 : this.weather === 'cloudy' ? 0.35 : 0;
    show(this.sunDisc, dir, dir.y > -0.05, clear);
    show(this.moonDisc, dir.clone().multiplyScalar(-1), dir.y < 0.05, clear * Math.min(1, c.night + 0.2));

    // clouds drift and wrap around
    this.clouds.children.forEach((g) => {
      g.position.x += (g.userData.speed as number) * dt;
      if (g.position.x > 340) g.position.x = -340;
      g.visible = (g.userData.base as number) < c.cloud + 0.35;
      g.scale.setScalar(0.7 + c.cloud * 0.7);
    });
    this.cloudMats.forEach((m) => {
      m.color.copy(c.cloudColor);
      m.opacity = 0.35 + 0.6 * Math.min(1, c.cloud + 0.2);
    });

    // rain falls around the view, in a loop that never shows a seam (two copies, one period apart)
    const rainOn = c.rain > 0.05;
    this.rainLines.visible = rainOn && this.weatherFx;
    this.clouds.visible = this.weatherFx;
    this.stars.visible = this.weatherFx;
    (this.rainLines.material as THREE.LineBasicMaterial).opacity = 0.75 * c.rain;
    this.rainLines.position.set(target.x, -((time * 26) % 34), target.z);

    if (Math.abs(c.rain - this.lastWet) > 0.01) {
      this.lastWet = c.rain;
      this.onWet?.(c.rain);
    }
    if (Math.abs(c.night - this.lastNight) > 0.01) {
      this.lastNight = c.night;
      this.onNight?.(c.night);
    }
  }
}
