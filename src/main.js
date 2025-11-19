import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import LocomotiveScroll from 'locomotive-scroll';



const locomotiveScroll = new LocomotiveScroll();


// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 6;

// Renderer setup
const canvas = document.querySelector('#canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// PMREM generator for environment maps
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

// Loading manager
const loadingManager = new THREE.LoadingManager();
loadingManager.onProgress = (url, loaded, total) => {
  console.log(`Loading: ${url} - ${(loaded / total * 100).toFixed(1)}%`);
};
loadingManager.onError = (url) => {
  console.error(`Error loading ${url}`);
};

// Lights (fallback if HDRI fails)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

// Model reference
let model = null;

// Loaders
const gltfLoader = new GLTFLoader(loadingManager);
const rgbeLoader = new RGBELoader(loadingManager);

// Load HDRI and Model
rgbeLoader.load(
  './pond_bridge_night_2k.hdr',
  (texture) => {
    console.log('HDRI loaded successfully');
    const envMap = pmremGenerator.fromEquirectangular(texture).texture;
    scene.environment = envMap;
    
    texture.dispose();
    pmremGenerator.dispose();

    // Load model after HDRI
    gltfLoader.load(
      './DamagedHelmet.gltf',
      (gltf) => {
        model = gltf.scene;
        scene.add(model);
        console.log('Model loaded successfully');
      },
      (xhr) => {
        if (xhr.total) {
          console.log('Model loading:', Math.round((xhr.loaded / xhr.total) * 100) + '%');
        }
      },
      (error) => {
        console.error('Model loading error:', error);
      }
    );
  },
  (xhr) => {
    if (xhr.total) {
      console.log('HDRI Loading:', Math.round((xhr.loaded / xhr.total) * 100) + '%');
    }
  },
  (error) => {
    console.error('HDRI loading error:', error);
    // Fallback: load model without HDRI
    gltfLoader.load('./DamagedHelmet.gltf', (gltf) => {
      model = gltf.scene;
      scene.add(model);
    });
  }
);

// RGB Shift shader
const RGBShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.003 },
    angle: { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float angle;
    varying vec2 vUv;
    void main() {
      vec2 offset = amount * vec2(cos(angle), sin(angle));
      vec4 cr = texture2D(tDiffuse, vUv + offset);
      vec4 cg = texture2D(tDiffuse, vUv);
      vec4 cb = texture2D(tDiffuse, vUv - offset);
      gl_FragColor = vec4(cr.r, cg.g, cb.b, cg.a);
    }
  `
};

// Post-processing setup
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const rgbShiftPass = new ShaderPass(RGBShiftShader);
composer.addPass(rgbShiftPass);

// Mouse interaction
const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

window.addEventListener('mousemove', (e) => {
  mouse.targetX = (e.clientX / window.innerWidth - 0.5) * Math.PI;
  mouse.targetY = (e.clientY / window.innerHeight - 0.5) * Math.PI;
});

// Window resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
function animate() {
  // Smooth mouse interpolation
  mouse.x += (mouse.targetX - mouse.x) * 0.05;
  mouse.y += (mouse.targetY - mouse.y) * 0.05;

  // Update model rotation
  if (model) {
    model.rotation.y = mouse.x * 0.12;
    model.rotation.x = mouse.y * 0.12;
  }

  // Update RGB shift
  rgbShiftPass.uniforms.angle.value += 0.005;

  // Render
  composer.render();
}

renderer.setAnimationLoop(animate);