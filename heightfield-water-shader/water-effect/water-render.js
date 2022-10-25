import metaversefile from 'metaversefile';
import * as THREE from 'three';
const {useLocalPlayer} = metaversefile;

class WaterRenderer {
  constructor(invisibleList, renderer, scene, camera, water) {

    this.invisibleList = invisibleList;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.water = water;

    // for depth 
    const pixelRatio = this.renderer.getPixelRatio();
    this.depthRenderTarget = new THREE.WebGLRenderTarget(
      window.innerWidth * pixelRatio,
      window.innerHeight * pixelRatio
    );
    this.depthRenderTarget.texture.minFilter = THREE.NearestFilter;
    this.depthRenderTarget.texture.magFilter = THREE.NearestFilter;
    this.depthRenderTarget.texture.generateMipmaps = false;
    this.depthRenderTarget.stencilBuffer = false;

    this.depthMaterial = new THREE.MeshDepthMaterial();
    this.depthMaterial.depthPacking = THREE.RGBADepthPacking;
    this.depthMaterial.blending = THREE.NoBlending;


    // for reflection
    this.eye = new THREE.Vector3(0, 0, 0);
    this.reflectorPlane = new THREE.Plane();
    this.normal = new THREE.Vector3();
    this.reflectorWorldPosition = new THREE.Vector3();
    this.cameraWorldPosition = new THREE.Vector3();
    this.rotationMatrix = new THREE.Matrix4();
    this.lookAtPosition = new THREE.Vector3(0, 0, -1);
    this.clipPlane = new THREE.Vector4();
    this.view = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.q = new THREE.Vector4();
    this.textureMatrix = new THREE.Matrix4();
    this.reflectionVirtualCamera = new THREE.PerspectiveCamera();
    const parameters = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        stencilBuffer: false,
    };
    this.mirrorRenderTarget = new THREE.WebGLRenderTarget(window.innerWidth * window.devicePixelRatio, window.innerHeight * window.devicePixelRatio, parameters);


    // for refraction
    this.refractionVirtualCamera = new THREE.PerspectiveCamera();
    this.refractionVirtualCamera.matrixAutoUpdate = false;
    this.refractionVirtualCamera.userData.refractor = true;
    this.refractorPlane = new THREE.Plane();
    this.refractionRenderTarget = new THREE.WebGLRenderTarget(window.innerWidth * window.devicePixelRatio, window.innerHeight * window.devicePixelRatio, parameters);
    this.refractorWorldPosition = new THREE.Vector3();
    this.refractP = new THREE.Vector3();
    this.refractQ = new THREE.Quaternion();
    this.refractS = new THREE.Vector3();
    this.clipVector = new THREE.Vector4();
    this.refractionClipPlane = new THREE.Plane();
    
  }
  renderDepthTexture(depthInvisibleList){
    this.renderer.setRenderTarget(this.depthRenderTarget);
    this.renderer.clear();
    for (const l of depthInvisibleList) {
      l.visible = false;
    }
    this.water.visible = false;
    this.scene.overrideMaterial = this.depthMaterial;

    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    this.scene.overrideMaterial = null;
    for (const l of depthInvisibleList) {
      l.visible = true;
    }
    this.water.visible = true;
  }
  renderMirror(renderer, scene, camera) {
    this.reflectorWorldPosition.setFromMatrixPosition(this.water.matrixWorld);
    this.cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);

    this.rotationMatrix.extractRotation(this.water.matrixWorld);

    this.normal.set(0, 1, 0);
    this.normal.applyMatrix4(this.rotationMatrix);

    this.view.subVectors(this.reflectorWorldPosition, this.cameraWorldPosition);

    // Avoid rendering when mirror is facing away

    if (this.view.dot(this.normal) > 0) return;

    this.view.reflect(this.normal).negate();
    this.view.add(this.reflectorWorldPosition);

    this.rotationMatrix.extractRotation(camera.matrixWorld);

    this.lookAtPosition.set(0, 0, -1);
    this.lookAtPosition.applyMatrix4(this.rotationMatrix);
    this.lookAtPosition.add(this.cameraWorldPosition);

    this.target.subVectors(this.reflectorWorldPosition, this.lookAtPosition);
    this.target.reflect(this.normal).negate();
    this.target.add(this.reflectorWorldPosition);

    this.reflectionVirtualCamera.position.copy(this.view);
    this.reflectionVirtualCamera.up.set(0, 1, 0);
    this.reflectionVirtualCamera.up.applyMatrix4(this.rotationMatrix);
    this.reflectionVirtualCamera.up.reflect(this.normal);
    this.reflectionVirtualCamera.lookAt(this.target);

    this.reflectionVirtualCamera.far = camera.far; // Used in WebGLBackground

    this.reflectionVirtualCamera.updateMatrixWorld();
    this.reflectionVirtualCamera.projectionMatrix.copy(camera.projectionMatrix);

    // Update the texture matrix
    this.textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );
    this.textureMatrix.multiply(this.reflectionVirtualCamera.projectionMatrix);
    this.textureMatrix.multiply(this.reflectionVirtualCamera.matrixWorldInverse);
    this.textureMatrix.multiply(this.water.matrixWorld);


    // Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
    // Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
    this.reflectorPlane.setFromNormalAndCoplanarPoint(this.normal, this.reflectorWorldPosition);
    this.reflectorPlane.applyMatrix4(this.reflectionVirtualCamera.matrixWorldInverse);

    this.clipPlane.set(
      this.reflectorPlane.normal.x,
      this.reflectorPlane.normal.y,
      this.reflectorPlane.normal.z,
      this.reflectorPlane.constant
    );

    const projectionMatrix = this.reflectionVirtualCamera.projectionMatrix;

    this.q.x =
      (Math.sign(this.clipPlane.x) + projectionMatrix.elements[8]) /
      projectionMatrix.elements[0];
    this.q.y =
      (Math.sign(this.clipPlane.y) + projectionMatrix.elements[9]) /
      projectionMatrix.elements[5];
    this.q.z = -1.0;
    this.q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];

    // Calculate the scaled plane vector
    this.clipPlane.multiplyScalar(2.0 / this.clipPlane.dot(this.q));

    // Replacing the third row of the projection matrix
    const clipBias = 0.00001;
    projectionMatrix.elements[2] = this.clipPlane.x;
    projectionMatrix.elements[6] = this.clipPlane.y;
    projectionMatrix.elements[10] = this.clipPlane.z + 1.0 - clipBias;
    projectionMatrix.elements[14] = this.clipPlane.w;

    this.eye.setFromMatrixPosition(camera.matrixWorld);
    
    // Render

    // this.mirrorRenderTarget.texture.encoding = renderer.outputEncoding;
    const localPlayer = useLocalPlayer();
    if (localPlayer.avatar) {
      localPlayer.avatar.app.visible = false;
    }
    for (const l of this.invisibleList) {
      l.visible = false;
    }
    this.water.visible = false;

    const currentRenderTarget = renderer.getRenderTarget();

    const currentXrEnabled = renderer.xr.enabled;
    const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;

    renderer.xr.enabled = false; // Avoid camera modification and recursion
    renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows

    renderer.setRenderTarget(this.mirrorRenderTarget);

    renderer.state.buffers.depth.setMask(true); // make sure the depth buffer is writable so it can be properly cleared, see #18897
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, this.reflectionVirtualCamera);

    renderer.xr.enabled = currentXrEnabled;
    renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;

    renderer.setRenderTarget(currentRenderTarget);

    // Restore viewport

    const viewport = camera.viewport;

    if (viewport !== undefined) {
      renderer.state.viewport(viewport);
    }

    this.water.visible = true;
    for (const l of this.invisibleList) {
      l.visible = true;
    }
    if (localPlayer.avatar) {
      localPlayer.avatar.app.visible = true;
    }
  }
  renderRefraction(renderer, scene, camera) {
    // ensure refractors are rendered only once per frame

    if ( camera.userData.refractor === true ) return;

    this.refractorWorldPosition.setFromMatrixPosition(this.water.matrixWorld);
    this.cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);

    this.view.subVectors(this.refractorWorldPosition, this.cameraWorldPosition);
    this.rotationMatrix.extractRotation(this.water.matrixWorld);
    this.normal.set(0, -1, 0);
    this.normal.applyMatrix4(this.rotationMatrix);

    if (this.view.dot(this.normal) > 0) return;

    this.water.matrixWorld.decompose(this.refractP, this.refractQ, this.refractS);
    this.normal.set(0, -1, 0).applyQuaternion(this.refractQ).normalize();

    // flip the normal because we want to cull everything above the plane
    this.normal.negate();

    this.refractorPlane.setFromNormalAndCoplanarPoint(this.normal, this.refractP);

    this.textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );
    this.textureMatrix.multiply(camera.projectionMatrix);
    this.textureMatrix.multiply(camera.matrixWorldInverse);
    this.textureMatrix.multiply(this.water.matrixWorld);

    this.refractionVirtualCamera.matrixWorld.copy(camera.matrixWorld);
    this.refractionVirtualCamera.matrixWorldInverse.copy(this.refractionVirtualCamera.matrixWorld).invert();
    this.refractionVirtualCamera.projectionMatrix.copy(camera.projectionMatrix);
    this.refractionVirtualCamera.far = camera.far; // used in WebGLBackground

    // The following code creates an oblique view frustum for clipping.
    // see: Lengyel, Eric. “Oblique View Frustum Depth Projection and Clipping”.
    // Journal of Game Development, Vol. 1, No. 2 (2005), Charles River Media, pp. 5–16

    this.refractionClipPlane.copy(this.refractorPlane);
    this.refractionClipPlane.applyMatrix4(this.refractionVirtualCamera.matrixWorldInverse);

    this.clipVector.set(this.refractionClipPlane.normal.x, this.refractionClipPlane.normal.y, this.refractionClipPlane.normal.z, this.refractionClipPlane.constant);

    // calculate the clip-space corner point opposite the clipping plane and
    // transform it into camera space by multiplying it by the inverse of the projection matrix

    const projectionMatrix = this.refractionVirtualCamera.projectionMatrix;

    this.q.x = (Math.sign(this.clipVector.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
    this.q.y = (Math.sign(this.clipVector.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
    this.q.z = - 1.0;
    this.q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];

    // calculate the scaled plane vector

    this.clipVector.multiplyScalar(2.0 / this.clipVector.dot(this.q));

    // replacing the third row of the projection matrix

    projectionMatrix.elements[2] = this.clipVector.x;
    projectionMatrix.elements[6] = this.clipVector.y;
    projectionMatrix.elements[10] = this.clipVector.z + 1.0 - 0.00001;
    projectionMatrix.elements[14] = this.clipVector.w;

    for (const l of this.invisibleList) {
      l.visible = false;
    }
    this.water.visible = false;

    const currentRenderTarget = renderer.getRenderTarget();
    const currentXrEnabled = renderer.xr.enabled;
    const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;

    renderer.xr.enabled = false; // avoid camera modification
    renderer.shadowMap.autoUpdate = false; // avoid re-computing shadows

    renderer.setRenderTarget(this.refractionRenderTarget);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, this.refractionVirtualCamera);

    renderer.xr.enabled = currentXrEnabled;
    renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
    renderer.setRenderTarget(currentRenderTarget);

    // restore viewport

    const viewport = camera.viewport;

    if (viewport !== undefined) {

      renderer.state.viewport(viewport);

    }
    for (const l of this.invisibleList) {
      l.visible = true;
    }
    this.water.visible = true;
  }
  

}

export default WaterRenderer;