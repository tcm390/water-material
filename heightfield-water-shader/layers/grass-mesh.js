import * as THREE from 'three';
import {PolygonPackage, PolygonMesh} from '../meshes/polygon-mesh.js';
import {glbUrlSpecs} from '../assets.js';

//

export const grassUrls = glbUrlSpecs.grasses;

//

const spriteLodCutoff = 8;
const meshLodSpecs = {
  1: {
    targetRatio: 1,
    targetError: 0,
  },
  2: {
    targetRatio: 0.3,
    targetError: 0.01,
  },
  4: {
    targetRatio: 0.2,
    targetError: 0.01,
  },
  /* 8: {
    targetRatio: 0.2,
    targetError: 0.05,
  },
  16: {
    targetRatio: 0.1,
    targetError: 0.1,
  }, */
};
const maxNumGeometries = 2;
const maxInstancesPerGeometryPerDrawCall = 8192;
const maxDrawCallsPerGeometry = 256;

//

export class GrassMesh extends THREE.Object3D {
  constructor({
    instance,
    // gpuTaskManager,
    physics,
  }) {
    super();

    this.polygonMesh = new PolygonMesh({
      instance,
      lodCutoff: spriteLodCutoff,
      maxNumGeometries,
      maxInstancesPerGeometryPerDrawCall,
      maxDrawCallsPerGeometry,
    });
    this.add(this.polygonMesh);

    this.physics = physics;
  }
  addChunk(chunk, chunkResult) {
    this.polygonMesh.addChunk(chunk, chunkResult);
  }
  removeChunk(chunk) {
    this.polygonMesh.removeChunk(chunk);
  }
  async waitForLoad() {
    const polygonPackage = await PolygonPackage.loadUrls(grassUrls, meshLodSpecs, this.physics);
    this.polygonMesh.setPackage(polygonPackage);

    /* // XXX debugging
    {
      const allLodMeshes = [];
      const {lodMeshes} = meshPackage;
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