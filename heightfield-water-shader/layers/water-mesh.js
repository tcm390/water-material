import * as THREE from 'three';
import metaversefile from 'metaversefile';
import {bufferSize, WORLD_BASE_HEIGHT, MIN_WORLD_HEIGHT, MAX_WORLD_HEIGHT} from '../constants.js';
import WaterParticleEffect from '../water-effect/particle.js';
import _createWaterMaterial from './water-material.js';
import WaterRenderer from '../water-effect/water-render.js';

const {useProcGenManager, useGeometryBuffering, useLocalPlayer, useInternals} = metaversefile;
const {BufferedMesh, GeometryAllocator} = useGeometryBuffering();
const procGenManager = useProcGenManager();

//
const fakeMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
});
const {renderer, camera, scene} = useInternals();
const localVector3D = new THREE.Vector3();
const localVector3D2 = new THREE.Vector3();
const localBox = new THREE.Box3();
const localQuaternion = new THREE.Quaternion();
const localVector = new THREE.Vector3();
//

// constants
const SWIM_HEIGHT_THRESHOLD = 0.75;
const SWIM_ONSURFACE_RANGE = 0.05;
const NORMAL_DAMPING = 1;
const MAX_DAMPING = 4.2;
const DAMPING_RATE = 1.03;
const BREASTSTROKE = 'breaststroke';
const WATER_HEIGHT = 0;
const SWIM_ACTION = 'swim';
const INITIAL_SWIM_ACTION = {
  type: SWIM_ACTION,
  onSurface: false,
  swimDamping: NORMAL_DAMPING,
  animationType: BREASTSTROKE
};

const getHashKey = (x, y) => {
  return ((x & 0xFFF) << 20) | ((y & 0xFFF) << 8);
}

export class WaterMesh extends BufferedMesh {
  constructor({ instance, gpuTaskManager, physics }) {
    const allocator = new GeometryAllocator(
      [
        {
          name: 'position',
          Type: Float32Array,
          itemSize: 3,
        },
        {
          name: 'normal',
          Type: Float32Array,
          itemSize: 3,
        },
        {
          name: 'factor',
          Type: Float32Array,
          itemSize: 1,
        },
      ],
      {
        bufferSize,
        boundingType: 'box',
        // hasOcclusionCulling: true
      }
    );

    const { geometry } = allocator;

    const material = _createWaterMaterial();

    super(geometry, material);

    this.instance = instance;
    this.gpuTaskManager = gpuTaskManager;

    this.allocator = allocator;
    this.gpuTasks = new Map();
    this.geometryBindings = new Map();

    // this.material = new THREE.MeshBasicMaterial({
    //   color: 0x0000ff,
    //   side: THREE.DoubleSide,
    //   transparent: true,
    //   opacity: 0.5,
    //   depthWrite: false,
    // });
    this.geometry = geometry;
    this.physics = physics;
    this.physicsObjectsMap = new Map();
    this.chunkPhysicObjcetMap = new Map();
    this.lastUpdateCoord = new THREE.Vector2();

    this.lastSwimmingHand = null;
    this.swimDamping = 1;

    this.invisibleList = [];
    this.depthInvisibleList = [];
    this.initSetUp();
  }
  addChunk(chunk, chunkResult) {
    const key = procGenManager.getNodeHash(chunk);
    const task = this.gpuTaskManager.transact(() => {
      const _mapOffsettedIndices = (
        srcIndices,
        dstIndices,
        dstOffset,
        positionOffset
      ) => {
        const positionIndex = positionOffset / 3;
        for (let i = 0; i < srcIndices.length; i++) {
          dstIndices[dstOffset + i] = srcIndices[i] + positionIndex;
        }
      };
      const _renderWaterMeshDataToGeometry = (
        waterGeometry,
        geometry,
        geometryBinding
      ) => {
        let positionOffset = geometryBinding.getAttributeOffset('position');
        let normalOffset = geometryBinding.getAttributeOffset('normal');
        let factorOffset = geometryBinding.getAttributeOffset('factor');
        let indexOffset = geometryBinding.getIndexOffset();

        _mapOffsettedIndices(
          waterGeometry.indices,
          geometry.index.array,
          indexOffset,
          positionOffset
        );

        geometry.attributes.position.update(
          positionOffset,
          waterGeometry.positions.length,
          waterGeometry.positions,
          0
        );
        geometry.attributes.normal.update(
          normalOffset,
          waterGeometry.normals.length,
          waterGeometry.normals,
          0
        );
        geometry.attributes.factor.update(
          factorOffset,
          waterGeometry.factors.length,
          waterGeometry.factors,
          0
        );
        geometry.index.update(indexOffset, waterGeometry.indices.length);
      };
      const _handleWaterMesh = (waterGeometry) => {
        const { chunkSize } = this.instance;

        const boundingBox = localBox.set(
          localVector3D.set(
            chunk.min.x * chunkSize,
            -WORLD_BASE_HEIGHT + MIN_WORLD_HEIGHT,
            chunk.min.y * chunkSize
          ),
          localVector3D2.set(
            (chunk.min.x + chunk.lod) * chunkSize,
            -WORLD_BASE_HEIGHT + MAX_WORLD_HEIGHT,
            (chunk.min.y + chunk.lod) * chunkSize
          )
        );
        /* localSphere.center.set(
            (chunk.min.x + 0.5) * chunkSize,
            (chunk.min.y + 0.5) * chunkSize,
            (chunk.min.z + 0.5) * chunkSize
          )
          .applyMatrix4(this.matrixWorld);
        localSphere.radius = chunkRadius; */

        // const min = localVector3D.set(chunk.min.x, chunk.min.y, chunk.min.z)
        //   .multiplyScalar(chunkSize);
        // const max = localVector3D2.set(chunk.min.x, chunk.min.y, chunk.min.z)
        //   .addScalar(chunk.lod)
        //   .multiplyScalar(chunkSize);

        // console.log(localVector3D.x + ", " + localVector3D2.x);

        const geometryBinding = this.allocator.alloc(
          waterGeometry.positions.length,
          waterGeometry.indices.length,
          boundingBox
          // min,
          // max,
          // this.appMatrix,
          // waterGeometry.peeks
        );
        // console.log(localVector3D);
        _renderWaterMeshDataToGeometry(
          waterGeometry,
          this.allocator.geometry,
          geometryBinding
        );

        this.geometryBindings.set(key, geometryBinding);
      };
      const waterGeometry = chunkResult.waterGeometry;
      _handleWaterMesh(waterGeometry);

      const _handlePhysics = async () => {
        const physicsGeo = new THREE.BufferGeometry();
        physicsGeo.setAttribute(
          'position',
          new THREE.BufferAttribute(waterGeometry.positions, 3)
        );
        physicsGeo.setIndex(
          new THREE.BufferAttribute(waterGeometry.indices, 1)
        );
        const physicsMesh = new THREE.Mesh(physicsGeo, fakeMaterial);

        const geometryBuffer = await this.physics.cookGeometryAsync(
          physicsMesh
        );

        if (geometryBuffer && geometryBuffer.length !== 0) {
          this.matrixWorld.decompose(
            localVector3D,
            localQuaternion,
            localVector3D2
          );
          const physicsObject = this.physics.addCookedGeometry(
            geometryBuffer,
            localVector3D,
            localQuaternion,
            localVector3D2
          );
          this.physics.disableGeometryQueries(physicsObject); // disable each physicsObject
          this.physicsObjectsMap.set(key, physicsObject);
          const chunkKey = getHashKey(chunk.min.x, chunk.min.y);
          this.chunkPhysicObjcetMap.set(chunkKey, physicsObject); // use chunk.min as a key to map each physicsObject
        }
      };
      if (waterGeometry.indices.length !== 0) {
        _handlePhysics();
      }
    });
    this.gpuTasks.set(key, task);
  }
  removeChunk(chunk) {
    const key = procGenManager.getNodeHash(chunk);

    {
      // console.log('chunk remove', key, chunk.min.toArray().join(','));
      const geometryBinding = this.geometryBindings.get(key);
      if (geometryBinding) {
        /* if (!geometryBinding) {
          debugger;
        } */
        this.allocator.free(geometryBinding);
        this.geometryBindings.delete(key);
      }
    }
    {
      const physicsObject = this.physicsObjectsMap.get(key);

      if (physicsObject) {
        this.physics.removeGeometry(physicsObject);
        this.physicsObjectsMap.delete(key);
      }
    }
    {
      const chunkKey = getHashKey(chunk.min.x, chunk.min.y);
      this.chunkPhysicObjcetMap.delete(chunkKey);
    }
    {
      const task = this.gpuTasks.get(key);
      task.cancel();
      this.gpuTasks.delete(key);
    }
  }

  checkWaterContact(chunkPhysicObject, player, waterSurfaceHeight) {
    // use overlapBox to check whether player contact the water
    this.physics.enableGeometryQueries(chunkPhysicObject);
    if (player.avatar) {
      let collisionIds;
      const height = player.avatar.height;
      const width = player.avatar.shoulderWidth;
      if (player.position.y > waterSurfaceHeight) {
        collisionIds = this.physics.overlapBox(
          width,
          height,
          width,
          player.position,
          player.quaternion
        ).objectIds;
      } else {
        localVector.set(
          player.position.x,
          waterSurfaceHeight,
          player.position.z
        );
        collisionIds = this.physics.overlapBox(
          width,
          height,
          width,
          localVector,
          player.quaternion
        ).objectIds;
      }
      for (const collisionId of collisionIds) {
        if (collisionId === chunkPhysicObject.physicsId) {
          // if we get the collisionId which is the id of the current chunk, then return true (avatar contact the water)
          // Also disable the queries so that we could still go into the water
          this.physics.disableGeometryQueries(chunkPhysicObject);
          return true;
        }
      }
    }
    this.physics.disableGeometryQueries(chunkPhysicObject);
    return false;
  }

  getSwimDamping(player) {
    if (
      this.lastSwimmingHand !== player.avatarCharacterSfx.currentSwimmingHand
    ) {
      this.lastSwimmingHand = player.avatarCharacterSfx.currentSwimmingHand;
      if (player.avatarCharacterSfx.currentSwimmingHand !== null) {
        return NORMAL_DAMPING;
      }
    }
    if (this.swimDamping < MAX_DAMPING && this.lastSwimmingHand) {
      return (this.swimDamping *= DAMPING_RATE);
    } else {
      return MAX_DAMPING;
    }
  }

  setOnSurfaceAction(swimAction, onSurface) {
    swimAction.onSurface = onSurface;
  }

  handleSwimAction(contactWater, player, waterSurfaceHeight) {
    const swimAction = player.getAction(SWIM_ACTION);
    const hasSwim = !!swimAction;

    const _setSwimAction = () => {
      !hasSwim && player.setControlAction(INITIAL_SWIM_ACTION);
    };

    const _removeSwimAction = () => {
      hasSwim && player.removeAction(SWIM_ACTION);
    };

    if (contactWater) {
      // this.material.color.setHex(0x1CEAD9); // for testing

      const _calculateSwimHeight = () => {
        const outsideWaterRange =
          player.avatar.height * (1 - SWIM_HEIGHT_THRESHOLD);
        return player.position.y - outsideWaterRange;
      };

      const _calculateSwimSurfaceHeight = (swimHeight) => {
        const onSurfaceRange = player.avatar.height * SWIM_ONSURFACE_RANGE;
        return swimHeight + onSurfaceRange;
      }

      const swimHeight = _calculateSwimHeight();

      if (waterSurfaceHeight >= swimHeight) {
        // check whether player is swimming on the water surface
        _setSwimAction();
        const swimSurfaceHeight = _calculateSwimSurfaceHeight(swimHeight);
        const addOnSurface = waterSurfaceHeight < swimSurfaceHeight;
        hasSwim && this.setOnSurfaceAction(swimAction, addOnSurface);
      } else {
        _removeSwimAction();
      }
    } else {
      // this.material.color.setHex(0xff0000); // for testing
      _removeSwimAction();
    }

    // handel swimming damping.
    if (hasSwim) {
      switch (swimAction.animationType) {
        case BREASTSTROKE:
          this.swimDamping = this.getSwimDamping(player);
          break;
        default:
          this.swimDamping = NORMAL_DAMPING;
          break;
      }

      swimAction.swimDamping = this.swimDamping;
    }
  }
  updateParticle(contactWater, localPlayer, waterSurfaceHeight) {
    this.particleEffect.update();
    this.particleEffect.contactWater = contactWater;
    this.particleEffect.player = localPlayer;
    this.particleEffect.waterSurfaceHeight = waterSurfaceHeight;
  };

  onBeforeRender(renderer, scene, camera) {
    this.waterRenderer && this.waterRenderer.renderDepthTexture(this.depthInvisibleList);
    if (this.underWater) {
      this.waterRenderer && this.waterRenderer.renderRefraction(renderer, scene, camera);
    }
    else {
      this.waterRenderer && this.waterRenderer.renderMirror(renderer, scene, camera);
    }
  }

  initSetUp() {
    this.particleEffect = new WaterParticleEffect(this.invisibleList);
    this.waterRenderer = new WaterRenderer(this.invisibleList, renderer, scene, camera, this);
    this.material.uniforms.tDepth.value = this.waterRenderer.depthRenderTarget.texture;
    this.material.uniforms.cameraNear.value = camera.near;
    this.material.uniforms.cameraFar.value = camera.far;
    this.material.uniforms.resolution.value.set(
        window.innerWidth * window.devicePixelRatio,
        window.innerHeight * window.devicePixelRatio
    );
    
    this.material.uniforms.refractionTexture.value = this.waterRenderer.refractionRenderTarget.texture;
    this.material.uniforms.mirror.value = this.waterRenderer.mirrorRenderTarget.texture;
    this.material.uniforms.textureMatrix.value = this.waterRenderer.textureMatrix;
    this.material.uniforms.eye.value = this.waterRenderer.eye;


    // foam texture
    const baseUrl = import.meta.url.replace(/(\/)[^\/\\]*$/, '$1');
    const textureLoader = new THREE.TextureLoader();
    const foamTexture = textureLoader.load(`${baseUrl}../water-effect/assets/textures/Waves10.png`);
    foamTexture.wrapS = foamTexture.wrapT = THREE.RepeatWrapping;
    this.material.uniforms.foamTexture.value = foamTexture;

    const tNormal = textureLoader.load(`${baseUrl}../water-effect/assets/textures/water_n.jpg`);
    tNormal.wrapS = tNormal.wrapT = THREE.RepeatWrapping;
    this.material.uniforms.tNormal.value = tNormal;

    const tDistortion = textureLoader.load(`${baseUrl}../water-effect/assets/textures/distortion.png`);
    tDistortion.wrapS = tDistortion.wrapT = THREE.RepeatWrapping;
    this.material.uniforms.tDistortion.value = tDistortion;
  }

  update() {
    const localPlayer = useLocalPlayer();
    const lastUpdateCoordKey = getHashKey(
      this.lastUpdateCoord.x,
      this.lastUpdateCoord.y
    );
    const currentChunkPhysicObject =
      this.chunkPhysicObjcetMap.get(lastUpdateCoordKey); // use lodTracker.lastUpdateCoord as a key to check which chunk player currently at

    let contactWater = false;
    // handel water physic and swimming action if we get the physicObject of the current chunk
    if (currentChunkPhysicObject) {
      contactWater = this.checkWaterContact(
        currentChunkPhysicObject,
        localPlayer,
        WATER_HEIGHT
      ); // check whether player contact the water

      // handle swimming action
      this.handleSwimAction(contactWater, localPlayer, WATER_HEIGHT);
    }
    // handle particle
    this.updateParticle(contactWater, localPlayer, WATER_HEIGHT);

    this.underWater = camera.position.y - 0.03 < WATER_HEIGHT;

    this.material.uniforms.uTime.value = performance.now() / 1000;
    this.material.uniforms.playerPos.value.copy(localPlayer.position);
    this.material.uniforms.cameraInWater.value = this.underWater;
  }
}