import * as THREE from 'three';
import metaversefile from 'metaversefile';
const {useCamera, useProcGenManager, useGeometries, useAtlasing, useGeometryBatching, useGeometryChunking, useLoaders, usePhysics, useSpriting} = metaversefile;
const procGenManager = useProcGenManager();
const {createAppUrlSpriteSheet} = useSpriting();
// const {DoubleSidedPlaneGeometry} = useGeometries();
const {ChunkedBatchedMesh, ChunkedGeometryAllocator} = useGeometryChunking();
import {
  // bufferSize,
  WORLD_BASE_HEIGHT,
  MIN_WORLD_HEIGHT,
  MAX_WORLD_HEIGHT,
  maxAnisotropy,
} from '../constants.js';

//

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localEuler = new THREE.Euler();
const localBox = new THREE.Box3();

//

export class SpritesheetPackage {
  constructor(canvas, offsets) {
    this.canvas = canvas;
    this.offsets = offsets;
  }
  static async loadUrls(urls) {
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');

    const offsets = new Float32Array(urls.length * 4);
    await Promise.all(urls.map(async (url, index) => {
      const numFrames = 8;

      const spritesheet = await createAppUrlSpriteSheet(url, {
        size: spritesheetSize,
        // size: 2048,
        numFrames,
      });
      const {
        result,
        worldWidth,
        worldHeight,
        worldOffset,
      } = spritesheet;

      const x = index % spritesheetsPerRow;
      const y = Math.floor(index / spritesheetsPerRow);
      ctx.drawImage(result, x * spritesheetSize, y * spritesheetSize);

      // debugging
      /* const canvas = document.createElement('canvas');
      canvas.width = result.width;
      canvas.height = result.height;
      canvas.style.cssText = `\
        position: fixed;
        top: 0;
        left: 0;
        width: 512px;
        height: 512px;
      `;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(result, 0, 0);
      document.body.appendChild(canvas); */

      offsets[index * 4] = worldOffset[0];
      offsets[index * 4 + 1] = worldOffset[1];
      offsets[index * 4 + 2] = worldOffset[2];
      const worldSize = Math.max(worldWidth, worldHeight);
      offsets[index * 4 + 3] = worldSize;
    }));

    const pkg = new SpritesheetPackage(canvas, offsets);
    return pkg;
  }
}

//

const canvasSize = 2048;
const spritesheetSize = 512;
const spritesheetsPerRow = canvasSize / spritesheetSize;
const numAngles = 8;
const numFramesPow2 = Math.pow(2, Math.ceil(Math.log2(numAngles)));
const numFramesPerRow = Math.ceil(Math.sqrt(numFramesPow2));
const maxDrawCalls = 256;
const maxInstancesPerDrawCall = 1024;
export class SpritesheetMesh extends ChunkedBatchedMesh {
  constructor({
    instance,
    lodCutoff,
  }) {
    const baseGeometry = new THREE.PlaneGeometry(1, 1);
    const allocator = new ChunkedGeometryAllocator(baseGeometry, [
      {
        name: 'p',
        Type: Float32Array,
        itemSize: 3,
      },
      {
        name: 'offset',
        Type: Float32Array,
        itemSize: 4,
      },
      {
        name: 'itemIndex',
        Type: Float32Array,
        itemSize: 1,
      },
    ], {
      maxDrawCalls,
      maxInstancesPerDrawCall,
      boundingType: 'box',
    });
    const {geometry, textures: attributeTextures} = allocator;
    for (const k in attributeTextures) {
      const texture = attributeTextures[k];
      texture.anisotropy = maxAnisotropy;
    }
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTex: {
          value: null,
          needsUpdate: null,
        },
        cameraPos: {
          value: new THREE.Vector3(),
          needsUpdate: false,
        },
        cameraY: {
          value: 0,
          needsUpdate: false,
        },
        numAngles: {
          value: numAngles,
          needsUpdate: true,
        },
        numFramesPerRow: {
          value: numFramesPerRow,
          needsUpdate: true,
        },
        spritesheetsPerRow: {
          value: spritesheetsPerRow,
          needsUpdate: true,
        },

        pTexture: {
          value: attributeTextures.p,
          needsUpdate: true,
        },
        offsetTexture: {
          value: attributeTextures.offset,
          needsUpdate: true,
        },
        itemIndexTexture: {
          value: attributeTextures.itemIndex,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        precision highp float;
        precision highp int;

        #define PI 3.1415926535897932384626433832795

        uniform sampler2D pTexture;
        uniform sampler2D offsetTexture;
        uniform sampler2D itemIndexTexture;
        uniform vec3 cameraPos;
        uniform float cameraY;
        varying vec2 vUv;
        flat varying float vItemIndex;
        varying float vY;

        vec3 rotate_vertex_position(vec3 position, vec4 q) { 
          return position + 2.0 * cross(q.xyz, cross(q.xyz, position) + q.w * position);
        }
        vec4 euler_to_quaternion(vec3 e) { // assumes YXZ order
          float x = e.x;
          float y = e.y;
          float z = e.z;

          float c1 = cos( x / 2. );
          float c2 = cos( y / 2. );
          float c3 = cos( z / 2. );

          float s1 = sin( x / 2. );
          float s2 = sin( y / 2. );
          float s3 = sin( z / 2. );

          vec4 q;
          q.x = s1 * c2 * c3 + c1 * s2 * s3;
          q.y = c1 * s2 * c3 - s1 * c2 * s3;
          q.z = c1 * c2 * s3 - s1 * s2 * c3;
          q.w = c1 * c2 * c3 + s1 * s2 * s3;
          return q;
        }
        void main() {
          int instanceIndex = gl_DrawID * ${maxInstancesPerDrawCall} + gl_InstanceID;
          const float width = ${attributeTextures.p.image.width.toFixed(8)};
          const float height = ${attributeTextures.p.image.height.toFixed(8)};
          float x = mod(float(instanceIndex), width);
          float y = floor(float(instanceIndex) / width);
          vec2 pUv = (vec2(x, y) + 0.5) / vec2(width, height);
          vec3 p = texture2D(pTexture, pUv).xyz;
          vec4 offsetFull = texture2D(offsetTexture, pUv).xyzw;
          vec3 offset = offsetFull.xyz;
          float s = offsetFull.w;
          float itemIndex = texture2D(itemIndexTexture, pUv).x;

          // transform position
          vec3 transformed = position;
          {
            transformed *= s;
            transformed += offset;

            vec3 e = vec3(0., cameraY, 0.);
            vec4 q = euler_to_quaternion(e);
            transformed = rotate_vertex_position(transformed, q);
            
            transformed += p;
          }

          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          vUv = uv;
          vItemIndex = itemIndex;

          const float PI_2 = PI * 2.;
          vY = mod(atan(cameraPos.z - p.z, cameraPos.x - p.x) - (PI * 0.5), PI_2) / PI_2;
        }
      `,
      fragmentShader: `\
        precision highp float;
        precision highp int;

        #define PI 3.1415926535897932384626433832795

        uniform sampler2D uTex;
        uniform float numAngles;
        uniform float numFramesPerRow;
        uniform float spritesheetsPerRow;
        varying vec2 vUv;
        flat varying float vItemIndex;
        varying float vY;

        void main() {
          float itemX = mod(vItemIndex, spritesheetsPerRow);
          float itemY = floor(vItemIndex / spritesheetsPerRow);
          vec2 uv =
            vec2(0., 1. - 1./spritesheetsPerRow) + // last spritesheet
            vec2(itemX, -itemY) / spritesheetsPerRow; // select spritesheet

          float angleIndex = floor(vY * numAngles);
          float i = angleIndex;
          float x = mod(i, numFramesPerRow);
          float y = floor(i / numFramesPerRow);
          float totalNumFramesPerRow = numFramesPerRow * spritesheetsPerRow;
          uv +=
            // vec2(0., -1./totalNumFramesPerRow) + // last row
            vec2(x, y)/totalNumFramesPerRow + // select frame
            vUv/totalNumFramesPerRow; // offset within frame

          gl_FragColor = texture(
            uTex,
            uv
          );

          const float alphaTest = 0.5;
          if (gl_FragColor.a < alphaTest) {
            discard;
          }
          gl_FragColor.a = 1.;
        }
      `,
      transparent: true,
    });
    super(geometry, material, allocator);
    this.frustumCulled = false;
    this.visible = false;

    this.instance = instance;
    this.lodCutoff = lodCutoff;

    this.offsets = new Float32Array(0);
    this.allocatedChunks = new Map();
  }
  addChunk(chunk, chunkResult) {
    const instances = chunkResult;

    if (chunk.lod >= this.lodCutoff && instances.length > 0) {
      const _renderLitterSpriteGeometry = (drawCall, instances) => {
        const pTexture = drawCall.getTexture('p');
        const pOffset = drawCall.getTextureOffset('p');
        const offsetTexture = drawCall.getTexture('offset');
        const offsetOffset = drawCall.getTextureOffset('offset');
        const itemIndexTexture = drawCall.getTexture('itemIndex');
        const itemIndexOffset = drawCall.getTextureOffset('itemIndex');

        let index = 0;
        for (let i = 0; i < instances.length; i++) {
          const instance = instances[i];
          const {instanceId, ps, qs} = instance;

          for (let j = 0; j < ps.length; j += 3) {
            const indexOffset = index * 4;
            
            // geometry
            const px = ps[index * 3];
            const py = ps[index * 3 + 1];
            const pz = ps[index * 3 + 2];
            pTexture.image.data[pOffset + indexOffset] = px;
            pTexture.image.data[pOffset + indexOffset + 1] = py;
            pTexture.image.data[pOffset + indexOffset + 2] = pz;

            offsetTexture.image.data[offsetOffset + indexOffset] = this.offsets[instanceId * 4];
            offsetTexture.image.data[offsetOffset + indexOffset + 1] = this.offsets[instanceId * 4 + 1];
            offsetTexture.image.data[offsetOffset + indexOffset + 2] = this.offsets[instanceId * 4 + 2];
            offsetTexture.image.data[offsetOffset + indexOffset + 3] = this.offsets[instanceId * 4 + 3];

            itemIndexTexture.image.data[itemIndexOffset + indexOffset] = instanceId;
        
            index++;
          }
        }

        drawCall.updateTexture('p', pOffset, index * 4);
        drawCall.updateTexture('offset', offsetOffset, index * 4);
        drawCall.updateTexture('itemIndex', itemIndexOffset, index * 4);
      };

      const {chunkSize} = this.instance;
      const boundingBox = localBox.set(
        localVector.set(
          chunk.min.x * chunkSize,
          -WORLD_BASE_HEIGHT + MIN_WORLD_HEIGHT,
          chunk.min.y * chunkSize
        ),
        localVector2.set(
          (chunk.min.x + chunk.lod) * chunkSize,
          -WORLD_BASE_HEIGHT + MAX_WORLD_HEIGHT,
          (chunk.min.y + chunk.lod) * chunkSize
        )
      );
      const totalInstances = (() => {
        let sum = 0;
        for (let i = 0; i < instances.length; i++) {
          const instance = instances[i];
          const {ps} = instance;
          sum += ps.length;
        }
        sum /= 3;
        return sum;
      })();
      const drawChunk = this.allocator.allocChunk(
        totalInstances,
        boundingBox
      );
      _renderLitterSpriteGeometry(drawChunk, instances);

      const key = procGenManager.getNodeHash(chunk);
      this.allocatedChunks.set(key, drawChunk);
    }
  }
  removeChunk(chunk) {
    const key = procGenManager.getNodeHash(chunk);
    const drawChunk = this.allocatedChunks.get(key);
    if (drawChunk) {
      this.allocator.freeChunk(drawChunk);
      this.allocatedChunks.delete(key);
    }
  }
  setPackage(pkg) {
    const {canvas} = pkg;
    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;

    this.material.uniforms.uTex.value = texture;
    this.material.uniforms.uTex.needsUpdate = true;

    this.offsets = pkg.offsets;

    this.visible = true;
  }
  update() {
    const camera = useCamera();
    localEuler.setFromQuaternion(camera.quaternion, 'YXZ');
    localEuler.x = 0;
    localEuler.z = 0;

    this.material.uniforms.cameraPos.value.copy(camera.position);
    this.material.uniforms.cameraPos.needsUpdate = true;

    this.material.uniforms.cameraY.value = localEuler.y;
    this.material.uniforms.cameraY.needsUpdate = true;
  }
}

//

export class LitterMetaMesh extends THREE.Object3D {
  constructor({
    instance,
    // gpuTaskManager,
    physics,
  }) {
    super();

    this.polygonMesh = new PolygonMesh({
      instance,
    });
    this.add(this.polygonMesh);

    this.spritesheetMesh = new SpritesheetMesh({
      instance,
    });
    this.add(this.spritesheetMesh);

    this.physics = physics;
  }
  update() {
    this.spritesheetMesh.update();
  }
  addChunk(chunk, chunkResult) {
    this.polygonMesh.addChunk(chunk, chunkResult);
    this.spritesheetMesh.addChunk(chunk, chunkResult);
  }
  removeChunk(chunk) {
    this.polygonMesh.removeChunk(chunk);
    this.spritesheetMesh.removeChunk(chunk);
  }
  async loadUrls(urls) {
    const [
      polygonPackage,
      spritesheetPackage,
    ] = await Promise.all([
      PolygonPackage.loadUrls(urls, this.physics),
      SpritesheetPackage.loadUrls(urls),
    ]);
    this.polygonMesh.setPackage(polygonPackage);
    this.spritesheetMesh.setPackage(spritesheetPackage);

    /* // XXX debugging
    {
      const allLodMeshes = [];
      const {lodMeshes} = polygonPackage;
      for (const lodMeshArray of lodMeshes) {
        for (const lodMesh of lodMeshArray) {
          // this.add(lodMesh);
          allLodMeshes.push(lodMesh);
        }
      }
      const meshSize = 3;
      for (let i = 0; i < allLodMeshes.length; i++) {
        const lodMesh = allLodMeshes[i];
        lodMesh.position.x = (-allLodMeshes.length/2 + i) * meshSize;
        lodMesh.position.y = 0.5;
        lodMesh.position.z = 5;
        this.add(lodMesh);
        lodMesh.updateMatrixWorld();
      }
    } */
  }
}