import * as THREE from 'three';
import metaversefile from 'metaversefile';
const {useCamera, useProcGenManager, useGeometries, useAtlasing, useGeometryBatching, useGeometryChunking, useLoaders, usePhysics, useSpriting} = metaversefile;
const procGenManager = useProcGenManager();
const {createTextureAtlas} = useAtlasing();
const {InstancedBatchedMesh, InstancedGeometryAllocator} = useGeometryBatching();
const {gltfLoader} = useLoaders();
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
// const localQuaternion = new THREE.Quaternion();
// const localEuler = new THREE.Euler();
// const localMatrix = new THREE.Matrix4();
const localBox = new THREE.Box3();

//

export class PolygonPackage {
  constructor(lodMeshes, textureNames) {
    this.lodMeshes = lodMeshes;
    this.textureNames = textureNames;
  }
  static async loadUrls(urls, meshLodSpecs, physics) {
    const _loadModel = u => new Promise((accept, reject) => {
      gltfLoader.load(u, o => {
        accept(o.scene);
      }, function onProgress() {}, reject);
    });
    const _getMesh = model => {
      let mesh = null;
      const _recurse = o => {
        if (o.isMesh) {
          mesh = o;
          return false;
        } else {
          for (let i = 0; i < o.children.length; i++) {
            if (!_recurse(o.children[i])) {
              return false;
            }
          }
          return true;
        }
      };
      _recurse(model);
      return mesh;
    };
    const _generateLodMesh = (() => {
      const promiseCache = new Map();
      return (mesh, meshLodSpec) => {
        const {targetRatio, targetError} = meshLodSpec;
        let promiseMap = promiseCache.get(mesh);
        if (!promiseMap) {
          promiseMap = new Map();
          promiseCache.set(mesh, promiseMap);
        }
        const key = `${targetRatio}:${targetError}`;
        let promise = promiseMap.get(key);
        if (!promise) {
          promise = (async () => {
            if (targetRatio === 1) {
              return mesh;
            } else {
              const lodMesh = await physics.meshoptSimplify(mesh, targetRatio, targetError);
              return lodMesh;
            }
          })();
          promiseMap.set(key, promise);
        }
        return promise;
      };
    })();
    const _generateLodMeshes = async mesh => {
      const meshLodSpecKeys = Object.keys(meshLodSpecs).map(Number);
      const lodMeshes = await Promise.all(meshLodSpecKeys.map(async lod => {
        const meshLodSpec = meshLodSpecs[lod];
        const lodMesh = await _generateLodMesh(mesh, meshLodSpec);
        return lodMesh;
      }));
      return lodMeshes;
    };
    

    const models = await Promise.all(urls.map(_loadModel));
    const meshes = models.map(_getMesh);
    const textureAtlasResult = createTextureAtlas(meshes, {
      textures: ['map', 'normalMap'],
      attributes: ['position', 'normal', 'uv'],
    });
    const {
      meshes: atlasMeshes,
      textureNames,
    } = textureAtlasResult;
    const lodMeshes = await Promise.all(atlasMeshes.map(_generateLodMeshes));
    
    const pkg = new PolygonPackage(lodMeshes, textureNames);
    return pkg;
  }
}

//

export class PolygonMesh extends InstancedBatchedMesh {
  constructor({
    instance,
    lodCutoff,
    maxNumGeometries,
    maxInstancesPerGeometryPerDrawCall,
    maxDrawCallsPerGeometry,
  } = {}) {
    // allocator
    const allocator = new InstancedGeometryAllocator([
      {
        name: 'p',
        Type: Float32Array,
        itemSize: 3,
      },
      {
        name: 'q',
        Type: Float32Array,
        itemSize: 4,
      },
    ], {
      maxNumGeometries,
      maxInstancesPerGeometryPerDrawCall,
      maxDrawCallsPerGeometry,
      boundingType: 'box',
    });
    const {textures: attributeTextures} = allocator;
    for (const k in attributeTextures) {
      const texture = attributeTextures[k];
      texture.anisotropy = maxAnisotropy;
    }

    // geometry
    // const geometry = new THREE.BufferGeometry();
    let geometry;

    // material
    const material = new THREE.MeshStandardMaterial({
      // map: atlasTextures.map,
      // normalMap: atlasTextures.normalMap,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.1,
      onBeforeCompile: (shader) => {
        shader.uniforms.pTexture = {
          value: attributeTextures.p,
          needsUpdate: true,
        };
        shader.uniforms.qTexture = {
          value: attributeTextures.q,
          needsUpdate: true,
        };
        
        // vertex shader

        shader.vertexShader = shader.vertexShader.replace(`#include <uv_pars_vertex>`, `\
#undef USE_INSTANCING

#include <uv_pars_vertex>

uniform sampler2D pTexture;
uniform sampler2D qTexture;

vec3 rotate_vertex_position(vec3 position, vec4 q) { 
  return position + 2.0 * cross(q.xyz, cross(q.xyz, position) + q.w * position);
}
        `);
        shader.vertexShader = shader.vertexShader.replace(`#include <begin_vertex>`, `\
#include <begin_vertex>

int instanceIndex = gl_DrawID * ${maxInstancesPerGeometryPerDrawCall} + gl_InstanceID;
const float width = ${attributeTextures.p.image.width.toFixed(8)};
const float height = ${attributeTextures.p.image.height.toFixed(8)};
float x = mod(float(instanceIndex), width);
float y = floor(float(instanceIndex) / width);
vec2 pUv = (vec2(x, y) + 0.5) / vec2(width, height);
vec3 p = texture2D(pTexture, pUv).xyz;
vec4 q = texture2D(qTexture, pUv).xyzw;

// instance offset
{
  transformed = rotate_vertex_position(transformed, q);
  transformed += p;
}
        `);
        shader.fragmentShader = shader.fragmentShader.replace(`#include <uv_pars_fragment>`, `\
#undef USE_INSTANCING

#if ( defined( USE_UV ) && ! defined( UVS_VERTEX_ONLY ) )
	varying vec2 vUv;
#endif
        `);

        // fragment shader
        
        return shader;
      },
    });

    // mesh
    super(geometry, material, allocator);
    this.frustumCulled = false;
    this.visible = false;
    
    // this.procGenInstance = procGenInstance;
    // this.meshes = lodMeshes;
    // this.shapeAddresses = shapeAddresses;
    // this.physicsGeometries = physicsGeometries;
    // this.physics = physics;
    // this.physicsObjects = [];

    // this.instanceObjects = new Map();

    this.instance = instance;
    this.lodCutoff = lodCutoff;
    
    this.allocatedChunks = new Map();
  }

  addChunk(chunk, chunkResult) {
    const instances = chunkResult;
    if (chunk.lod < this.lodCutoff && instances.length > 0) {
      const _renderLitterPolygonGeometry = (drawCall, ps, qs) => {
        const pTexture = drawCall.getTexture('p');
        const pOffset = drawCall.getTextureOffset('p');
        const qTexture = drawCall.getTexture('q');
        const qOffset = drawCall.getTextureOffset('q');
        // const sTexture = drawCall.getTexture('s');
        // const sOffset = drawCall.getTextureOffset('s');

        let index = 0;
        for (let j = 0; j < ps.length; j += 3) {
          const indexOffset = index * 4;
          
          // geometry
          const px = ps[index * 3];
          const py = ps[index * 3 + 1];
          const pz = ps[index * 3 + 2];
          pTexture.image.data[pOffset + indexOffset] = px;
          pTexture.image.data[pOffset + indexOffset + 1] = py;
          pTexture.image.data[pOffset + indexOffset + 2] = pz;

          const qx = qs[index * 4];
          const qy = qs[index * 4 + 1];
          const qz = qs[index * 4 + 2];
          const qw = qs[index * 4 + 3];
          qTexture.image.data[qOffset + indexOffset] = qx;
          qTexture.image.data[qOffset + indexOffset + 1] = qy;
          qTexture.image.data[qOffset + indexOffset + 2] = qz;
          qTexture.image.data[qOffset + indexOffset + 3] = qw;

          // XXX get scales from the mapped geometry
          /* const sx = ss[index * 3];
          const sy = ss[index * 3 + 1];
          const sz = ss[index * 3 + 2]; */
          // const sx = 1;
          // const sy = 1;
          // const sz = 1;
          // sTexture.image.data[sOffset + indexOffset] = sx;
          // sTexture.image.data[sOffset + indexOffset + 1] = sy;
          // sTexture.image.data[sOffset + indexOffset + 2] = sz;

          // physics
          // const shapeAddress = this.#getShapeAddress(drawCall.geometryIndex);
          // const physicsObject = this.#addPhysicsShape(shapeAddress, drawCall.geometryIndex, px, py, pz, qx, qy, qz, qw);
          // this.physicsObjects.push(physicsObject);
          // localPhysicsObjects.push(physicsObject);
          // this.instanceObjects.set(physicsObject.physicsId, drawCall);
      
          index++;
        }

        drawCall.updateTexture('p', pOffset, index * 4);
        drawCall.updateTexture('q', qOffset, index * 4);
        // drawCall.updateTexture('s', sOffset, index * 4);
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
      const lodIndex = Math.log2(chunk.lod);
      const drawChunks = Array(instances.length);
      for (let i = 0; i < instances.length; i++) {
        const {
          instanceId,
          ps,
          qs,
        } = instances[i];
        const geometryIndex = instanceId;
        const numInstances = ps.length / 3;

        const drawChunk = this.allocator.allocDrawCall(
          geometryIndex,
          lodIndex,
          numInstances,
          boundingBox
        );
        _renderLitterPolygonGeometry(drawChunk, ps, qs);
        drawChunks[i] = drawChunk;
      }
      const key = procGenManager.getNodeHash(chunk);
      this.allocatedChunks.set(key, drawChunks);
    }
  }
  removeChunk(chunk) {
    const key = procGenManager.getNodeHash(chunk);
    const drawChunks = this.allocatedChunks.get(key);
    if (drawChunks) {
      for (const drawChunk of drawChunks) {
        this.allocator.freeDrawCall(drawChunk);
      }
    }
    this.allocatedChunks.delete(key);
  }

  /* #getShapeAddress(geometryIndex) {
    return this.shapeAddresses[geometryIndex];
  }
  #getShapeGeometry(geometryIndex){
    return this.physicsGeometries[geometryIndex];
  }
  #addPhysicsShape(shapeAddress, geometryIndex, px, py, pz, qx, qy, qz, qw) {    
    localVector.set(px, py, pz);
    localQuaternion.set(qx, qy, qz, qw);
    localVector2.set(1, 1, 1);
    localMatrix.compose(localVector, localQuaternion, localVector2)
      .premultiply(this.matrixWorld)
      .decompose(localVector, localQuaternion, localVector2);

    const position = localVector;
    const quaternion = localQuaternion;
    const scale = localVector2;
    const dynamic = false;
    const external = true;

    const physicsGeometry = this.#getShapeGeometry(geometryIndex);
    const physicsObject = this.physics.addConvexShape(shapeAddress, position, quaternion, scale, dynamic, external,physicsGeometry);
  
    this.physicsObjects.push(physicsObject);

    return physicsObject;
  } */
  
  grabInstance(physicsId){
    const phys = metaversefile.getPhysicsObjectByPhysicsId(physicsId);
    this.physics.removeGeometry(phys);
    const drawcall = this.instanceObjects.get(physicsId);
    drawcall.decrementInstanceCount();
  }
  /* getPhysicsObjects() {
    return this.physicsObjects;
  } */
  setPackage(pkg) {
    // console.log('set package', pkg);
    const {lodMeshes, textureNames} = pkg;
    // console.log('set package', {lodMeshes, textureNames});
    this.allocator.setGeometries(lodMeshes.map(lodMeshesArray => {
      return lodMeshesArray.map(lodMesh => {
        return lodMesh.geometry;
      });
    }));
    this.geometry = this.allocator.geometry;

    for (const textureName of textureNames) {
      this.material[textureName] = lodMeshes[0][0].material[textureName];
    }

    this.visible = true;
  }
}