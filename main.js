//
// Written by Nguyen Minh Hieu (Charlie), 2024
//
const vertShaderSrc = `#version 300 es
  precision mediump float;

  uniform mat4 u_mvp;
  uniform lowp int u_isDebug;
  uniform vec3 u_eye;

  in vec3 a_pos;
  in vec3 a_col; // for debug

  out vec3 v_pos;

  void main() {
    v_pos = a_pos;
    gl_Position = u_mvp * vec4(a_pos, 1.0);
  }
`;

const fragShaderSrc = `#version 300 es
  precision mediump float;

  uniform highp sampler3D u_vol;
  uniform highp sampler2D u_cmap; // to be used later;
  uniform vec3 u_eye;

  in vec3 v_pos;
  out vec4 fragColor;

  vec2 intersectBox(vec3 o, vec3 d) {
    const vec3 bmin = vec3(-1);
    const vec3 bmax = vec3(1);
    vec3 dinv = 1.0 / d;
    vec3 ta = (bmin - o) * dinv;
    vec3 tb = (bmax - o) * dinv;
    vec3 tmin = min(ta, tb);
    vec3 tmax = max(ta, tb);
    float t0 = max(tmin.x, max(tmin.y, tmin.z));
    float t1 = min(tmax.x, min(tmax.y, tmax.z));
    return vec2(t0, t1);
  }

  // integer hash copied from Hugo Elias
  float hash( uint n ) {
    n = (n << 13U) ^ n;
    n = n * (n * n * 15731U + 789221U) + 1376312589U;
    return float(n & uint(0x7fffffffU))/float(0x7fffffff);
  }

  float linear_to_srgb(float x) {
    if (x <= 0.0031308f) {
      return 12.92f * x;
    }
    return 1.055f * pow(x, 1.f / 2.4f) - 0.055f;
  }

  int outside_volume(vec3 p) {
    int o = (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z < 0.0 || p.z > 1.0) ? 1 : 0;
    return o;

  }

  void main() {
    vec3 d = normalize(v_pos - u_eye);
    vec2 t = intersectBox(u_eye, d);
    if (t.x > t.y) {
      discard;
      fragColor = vec4(vec3(0.0), 1.0);
      return;
    }
    t.x = max(t.x, 0.0) / 3.0;

    float offset = hash(uint(gl_FragCoord.x) + uint(800)*uint(gl_FragCoord.y));
    float dt = (t.y - t.x) / 100.0; // distance between ti and ti+1
    vec3 p = u_eye + (t.x + offset / 5.0) * d;

    float alpha = 0.0;

    for (float ti = t.x; ti < t.y; ti += dt) {
      vec3 p_ = p / 1.5 + 0.5;
      float val = (outside_volume(p_) > 0) ? 0.0 : texture(u_vol, p_.yxz).r; // density
      alpha += (1.0 - alpha) * (1.0 - pow(1.0 - val, dt));
      if (alpha > 0.95) break;
      p += d * dt;
    }

    fragColor = vec4(vec3(1.0 - alpha * 1.5), 1.0);
  }
`;

const clear = (gl) => {
  gl.clearColor(1.0, 1.0, 1.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

const makeShader = (gl, type, src) => {
  let shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Error compiling shader!", gl.getShaderInfoLog(shader));
    return NULL;
  }
  return shader;
}

const makeProgram = (gl, vertShader, fragShader) => {
  let program = gl.createProgram();
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);

  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Error linking program!", gl.getProgramInfoLog(program));
    return NULL;
  }

  gl.validateProgram(program);
  if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
    console.error("Error validating program!", gl.getProgramInfoLog(program));
    return NULL;
  }

  gl.useProgram(program);
  return program;
}

const loadShader = (gl) => {
  let vertShader = makeShader(gl, gl.VERTEX_SHADER,   vertShaderSrc);
  let fragShader = makeShader(gl, gl.FRAGMENT_SHADER, fragShaderSrc);
  var shaderProg = makeProgram(gl, vertShader, fragShader);
  return shaderProg;
}

const loadGlContext = () => {
  let canvas = document.getElementById("canvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  var gl = canvas.getContext("webgl2");

  if (!gl) {
    console.log("WebGL not supported, falling back on experimental-webgl");
    gl = canvas.getContext("experimental-webgl");
  }

  if (!gl) {
    alert("Your browser does not support WebGL");
  }

  gl.enable(gl.DEPTH_TEST);
	gl.enable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
	gl.frontFace(gl.CCW);
	gl.cullFace(gl.BACK);

  return [canvas, gl];
}

const loadGeometry = (gl, shaderProg) => {
  let boxVertexData = new Float32Array([
    // X, Y, Z             R,   G,   B
		// Top
		-1.0,  1.0, -1.0,    0.5, 0.5, 0.5,
		-1.0,  1.0,  1.0,    0.5, 0.5, 0.5,
		 1.0,  1.0,  1.0,    0.5, 0.5, 0.5,
		 1.0,  1.0, -1.0,    0.5, 0.5, 0.5,

		// Left
		-1.0,  1.0,  1.0,   0.75, 0.25, 0.5,
		-1.0, -1.0,  1.0,   0.75, 0.25, 0.5,
		-1.0, -1.0, -1.0,   0.75, 0.25, 0.5,
		-1.0,  1.0, -1.0,   0.75, 0.25, 0.5,

		// Right
		 1.0,  1.0,  1.0,   0.25, 0.25, 0.75,
		 1.0, -1.0,  1.0,   0.25, 0.25, 0.75,
		 1.0, -1.0, -1.0,   0.25, 0.25, 0.75,
		 1.0,  1.0, -1.0,   0.25, 0.25, 0.75,

		// Front
		 1.0,  1.0,  1.0,    1.0,  0.0, 0.15,
		 1.0, -1.0,  1.0,    1.0,  0.0, 0.15,
		-1.0, -1.0,  1.0,    1.0,  0.0, 0.15,
		-1.0,  1.0,  1.0,    1.0,  0.0, 0.15,

		// Back
		 1.0,  1.0, -1.0,    0.0,  1.0, 0.15,
		 1.0, -1.0, -1.0,    0.0,  1.0, 0.15,
		-1.0, -1.0, -1.0,    0.0,  1.0, 0.15,
		-1.0,  1.0, -1.0,    0.0,  1.0, 0.15,

		// Bottom
		-1.0, -1.0, -1.0,    0.5,  0.5, 1.0,
		-1.0, -1.0,  1.0,    0.5,  0.5, 1.0,
		 1.0, -1.0,  1.0,    0.5,  0.5, 1.0,
		 1.0, -1.0, -1.0,    0.5,  0.5, 1.0,
	]);

  let boxIndexData = new Uint16Array([
    // Top
		0, 1, 2,
		0, 2, 3,

		// Left
		5, 4, 6,
		6, 4, 7,

		// Right
		8, 9, 10,
		8, 10, 11,

		// Front
		13, 12, 14,
		15, 14, 12,

		// Back
		16, 17, 18,
		16, 18, 19,

		// Bottom
		21, 20, 22,
		22, 20, 23
	]);


  let vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, boxVertexData, gl.STATIC_DRAW);

  let ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, boxIndexData, gl.STATIC_DRAW);

  let posAttrLoc = gl.getAttribLocation(shaderProg, "a_pos");
  gl.vertexAttribPointer(
    posAttrLoc,   // attr location
    3,            // number of attr values per vertex
    gl.FLOAT,     // type
    gl.FALSE,     // normalize
    6 * Float32Array.BYTES_PER_ELEMENT, // total size of vertex attr
    0             // offset from beginning of buffer
  );
  gl.enableVertexAttribArray(posAttrLoc);

  let colAttrLoc = gl.getAttribLocation(shaderProg, "a_col");
  gl.vertexAttribPointer(
    colAttrLoc,   // attr location
    3,            // number of attr values per vertex
    gl.FLOAT,     // type
    gl.FALSE,     // normalize
    6 * Float32Array.BYTES_PER_ELEMENT, // total size of vertex attr
    3 * Float32Array.BYTES_PER_ELEMENT  // offset from beginning of buffer
  );
  gl.enableVertexAttribArray(colAttrLoc);

  return boxIndexData.length;
}

const getVolData = async (filepath="./Skull.json") => {
  return fetch(filepath).then(rep => {
    if (!rep.ok) throw new Error("Failed to fetch volume data!");
    let vol_data = rep.json();
    return vol_data;
  });
}

const loadVolumeTexture = async (gl, shaderProg) => {
  let vol_data = await getVolData();
  console.log(vol_data);
  console.log(vol_data.dimX* vol_data.dimY* vol_data.dimZ, vol_data.data.length);

  var tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_3D, tex);
  gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R8, vol_data.dimX, vol_data.dimY, vol_data.dimZ);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texSubImage3D(
    gl.TEXTURE_3D,
    0, 0, 0, 0, // mipmap level; x y z offsets
		vol_data.dimX, vol_data.dimY, vol_data.dimZ,
		gl.RED,
    gl.UNSIGNED_BYTE,
    new Uint8Array(vol_data.data)
  );

  gl.generateMipmap(gl.TEXTURE_3D);
  gl.uniform1i(gl.getUniformLocation(shaderProg, "u_vol"), 0);
}

const main = async (debug=false) => {
  let [canvas, gl]  = loadGlContext();
  let shaderProg    = loadShader(gl);
  let nVert         = loadGeometry(gl, shaderProg);
  await loadVolumeTexture(gl, shaderProg);

  gl.uniform1i(gl.getUniformLocation(shaderProg, "u_isDebug"), debug);

  let drawCallback = () => {
    clear(gl);
    gl.drawElements(gl.TRIANGLES, nVert, gl.UNSIGNED_SHORT, 0)
  };

  const camera = new ArcballCamera(gl, canvas, shaderProg, drawCallback);
  camera.update();
}
