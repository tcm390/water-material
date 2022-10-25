import * as THREE from 'three';

const baseUrl = import.meta.url.replace(/(\/)[^\/\\]*$/, '$1');
const textureLoader = new THREE.TextureLoader();

const loadTexture = (path, wrap = true) => {
  const texture = textureLoader.load(baseUrl + path);
  if (wrap) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  } 
  return texture;
};

export default loadTexture;