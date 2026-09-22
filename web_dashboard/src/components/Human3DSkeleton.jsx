import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// روابط مفاصل الجسم البشري في MediaPipe Pose (33 نقطة)
const BODY_BONES = [
  // الرأس والوجه
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  // الكتفان والصدر
  [11, 12],
  // الذراع الأيمن
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  // الذراع الأيسر
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  // الجذع والحوض
  [11, 23], [12, 24], [23, 24],
  // الساق اليمنى
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
  // الساق اليسرى
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31]
]

// ألوان مفاصل الجسم
const JOINT_COLORS = {
  head: '#ffaa00',
  torso: '#00e5ff',
  rightArm: '#00ff88',
  leftArm: '#44aaff',
  legs: '#aa44ff'
}

function getJointColor(index) {
  if (index <= 10) return JOINT_COLORS.head
  if (index === 11 || index === 12 || index === 23 || index === 24) return JOINT_COLORS.torso
  if (index === 14 || index === 16 || index === 18 || index === 20 || index === 22) return JOINT_COLORS.rightArm
  if (index === 13 || index === 15 || index === 17 || index === 19 || index === 21) return JOINT_COLORS.leftArm
  return JOINT_COLORS.legs
}

export default function Human3DSkeleton({ rawLandmarks = null, isTracking = false, position = [-1.5, 0, 0] }) {
  const jointMeshes = useRef([])
  const boneLines = useRef([])

  // إعداد مواقع المفاصل الافتراضية عند عدم وجود تتبع
  const defaultLandmarks = useMemo(() => {
    // وضعية الوقوف القياسية T-Pose
    return Array.from({ length: 33 }, (_, i) => {
      // إحداثيات تقريبية ثلاثية الأبعاد
      const pos = new THREE.Vector3(0, 0, 0)
      if (i === 0) pos.set(0, 1.7, 0) // أنف
      else if (i === 11) pos.set(-0.35, 1.4, 0) // كتف أيسر
      else if (i === 12) pos.set(0.35, 1.4, 0) // كتف أيمن
      else if (i === 13) pos.set(-0.65, 1.1, 0) // كوع أيسر
      else if (i === 14) pos.set(0.65, 1.1, 0) // كوع أيمن
      else if (i === 15) pos.set(-0.9, 0.85, 0.1) // معصم أيسر
      else if (i === 16) pos.set(0.9, 0.85, 0.1) // معصم أيمن
      else if (i === 23) pos.set(-0.2, 0.9, 0) // ورك أيسر
      else if (i === 24) pos.set(0.2, 0.9, 0) // ورك أيمن
      else if (i === 25) pos.set(-0.22, 0.45, 0) // ركبة يسرى
      else if (i === 26) pos.set(0.22, 0.45, 0) // ركبة يمنى
      else if (i === 27) pos.set(-0.22, 0.05, 0) // كاحل أيسر
      else if (i === 28) pos.set(0.22, 0.05, 0) // كاحل أيمن
      else pos.set(0, 1.2, 0)
      return pos
    })
  }, [])

  // ذاكرة المواقع الحالية للتنعيم
  const currentPositions = useRef(defaultLandmarks.map(p => p.clone()))

  useFrame((state, delta) => {
    const hasData = isTracking && rawLandmarks && rawLandmarks.length >= 33

    for (let i = 0; i < 33; i++) {
      let targetX, targetY, targetZ

      if (hasData) {
        const pt = rawLandmarks[i]
        // تحويل إحداثيات MediaPipe (0 to 1) إلى فضاء العالم ثلاثي الأبعاد
        // X معكوس كالمرآة، Y مقلوب (0 في الأعلى)، Z عمق
        targetX = (1.0 - pt.x - 0.5) * 2.2
        targetY = (1.0 - pt.y) * 2.0
        targetZ = (pt.z || 0) * -1.8
      } else {
        // حركة تنفس ناعمة أثناء الخمول
        const idleSway = Math.sin(state.clock.elapsedTime * 2) * 0.02
        targetX = defaultLandmarks[i].x + (i >= 13 && i <= 16 ? idleSway : 0)
        targetY = defaultLandmarks[i].y + idleSway
        targetZ = defaultLandmarks[i].z
      }

      const cur = currentPositions.current[i]
      cur.x = THREE.MathUtils.damp(cur.x, targetX, 10, delta)
      cur.y = THREE.MathUtils.damp(cur.y, targetY, 10, delta)
      cur.z = THREE.MathUtils.damp(cur.z, targetZ, 10, delta)

      if (jointMeshes.current[i]) {
        jointMeshes.current[i].position.copy(cur)
      }
    }

    // تحديث خطوط العظام بين المفاصل
    BODY_BONES.forEach(([idxA, idxB], boneIdx) => {
      const lineMesh = boneLines.current[boneIdx]
      if (lineMesh && currentPositions.current[idxA] && currentPositions.current[idxB]) {
        const posA = currentPositions.current[idxA]
        const posB = currentPositions.current[idxB]

        const positions = lineMesh.geometry.attributes.position
        if (positions) {
          positions.setXYZ(0, posA.x, posA.y, posA.z)
          positions.setXYZ(1, posB.x, posB.y, posB.z)
          positions.needsUpdate = true
        }
      }
    })
  })

  return (
    <group position={position}>
      {/* قاعدة ضوئية أسفل الإنسان */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.45, 32]} />
        <meshBasicMaterial color="#00e5ff" side={THREE.DoubleSide} transparent opacity={0.6} />
      </mesh>

      {/* 33 عقدة مفصلية للمجسم البشري */}
      {Array.from({ length: 33 }).map((_, i) => (
        <mesh
          key={`joint-${i}`}
          ref={el => (jointMeshes.current[i] = el)}
          position={[0, 0, 0]}
        >
          <sphereGeometry args={[i === 0 ? 0.08 : i === 11 || i === 12 || i === 23 || i === 24 ? 0.05 : 0.035, 16, 16]} />
          <meshStandardMaterial
            color={getJointColor(i)}
            emissive={getJointColor(i)}
            emissiveIntensity={isTracking ? 0.8 : 0.4}
            roughness={0.2}
            metalness={0.8}
          />
        </mesh>
      ))}

      {/* خطوط العظام الرابطة بين المفاصل */}
      {BODY_BONES.map(([idxA, idxB], boneIdx) => {
        const geom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0, 0)
        ])
        return (
          <line
            key={`bone-${boneIdx}`}
            ref={el => (boneLines.current[boneIdx] = el)}
            geometry={geom}
          >
            <lineBasicMaterial
              color={idxA <= 12 && idxB <= 12 ? '#00e5ff' : '#00ff88'}
              linewidth={2}
              transparent
              opacity={isTracking ? 0.85 : 0.5}
            />
          </line>
        )
      })}
    </group>
  )
}
