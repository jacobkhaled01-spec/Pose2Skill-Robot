import React, { useState, useEffect, useRef } from 'react'

// المهارات الافتراضية المضمنة في النظام
const DEFAULT_SKILLS = [
  {
    id: 'skill-pick-place',
    name: 'التقاط ونقل المكعب (Pick & Place)',
    description: 'تحريك الذراع للأسفل، إمساك المكعب، رفعه، ونقله لمنطقة الهدف',
    category: 'Manipulation',
    duration: 5.2,
    keyframesCount: 7,
    created: 'النظام الافتراضي',
    phases: ['Approach', 'Reach', 'Grasp', 'Lift', 'Transport', 'Place', 'Release']
  },
  {
    id: 'skill-wave',
    name: 'التحية باليدين (Humanoid Wave)',
    description: 'رفع الذراع للأعلى والتلويح باليد يميناً ويساراً في الهواء',
    category: 'Gestural',
    duration: 3.5,
    keyframesCount: 5,
    created: 'النظام الافتراضي',
    phases: ['Raise Arm', 'Wave Right', 'Wave Left', 'Wave Right', 'Lower Arm']
  },
  {
    id: 'skill-obstacle',
    name: 'تجاوز ونقل العائق (Obstacle Relocation)',
    description: 'رفع المكعب لمستوى مرتفع وتفادي الاصطدام بالحاجز',
    category: 'Motion Planning',
    duration: 6.0,
    keyframesCount: 6,
    created: 'النظام الافتراضي',
    phases: ['Approach', 'Grasp', 'High Lift', 'Clear Obstacle', 'Lower', 'Place']
  }
]

export default function SkillTeachingManager({
  isRecording = false,
  onStartRecording,
  onStopRecording,
  onReplaySkill,
  activeReplayId = null,
  isCameraActive = false
}) {
  // قائمة المهارات المخزنة في localStorage
  const [skills, setSkills] = useState(() => {
    try {
      const saved = localStorage.getItem('pose2skill_saved_skills')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.warn('Could not read saved skills from localStorage', e)
    }
    return DEFAULT_SKILLS
  })

  // مؤقت التسجيل
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const timerRef = useRef(null)

  // الإطارات المسجلة المحفوظة مؤقتاً قبل الحفظ النهائي
  const [capturedFrames, setCapturedFrames] = useState([])

  // نافذة حفظ المهارة
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [newSkillName, setNewSkillName] = useState('')
  const [newSkillDesc, setNewSkillDesc] = useState('')

  // تحديث التخزين المحلي عند تغير المهارات
  useEffect(() => {
    try {
      localStorage.setItem('pose2skill_saved_skills', JSON.stringify(skills))
    } catch (e) {
      console.warn('Could not persist skills to localStorage', e)
    }
  }, [skills])

  // عداد وقت التسجيل
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0)
      timerRef.current = setInterval(() => {
        setRecordingSeconds(prev => +(prev + 0.1).toFixed(1))
      }, 100)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRecording])

  // إيقاف التسجيل وطلب حفظ المهارة
  const handleStopAndPromptSave = () => {
    const recordedFrames = onStopRecording ? onStopRecording() : []
    setCapturedFrames(recordedFrames)
    setNewSkillName(`مهارة مخصصة #${skills.length + 1}`)
    setNewSkillDesc(`حركة مسجلة عبر تتبع الكاميرا الحية (${recordingSeconds} ثانية - ${recordedFrames.length} إطار)`)
    setShowSaveModal(true)
  }

  // تأكيد حفظ المهارة الجديدة
  const confirmSaveSkill = () => {
    if (!newSkillName.trim()) return

    const newSkill = {
      id: `skill-${Date.now()}`,
      name: newSkillName.trim(),
      description: newSkillDesc.trim() || 'مهارة مسجلة من العرض البشري',
      category: 'Custom Taught',
      duration: recordingSeconds || 4.0,
      keyframesCount: capturedFrames.length || Math.max(4, Math.round(recordingSeconds * 5)),
      created: 'مسجلة الآن من الكاميرا',
      phases: ['Demonstration Start', 'Trajectory Follow', 'Grasp Action', 'Goal Reach'],
      frames: capturedFrames
    }

    setSkills(prev => [newSkill, ...prev])
    setShowSaveModal(false)
    setNewSkillName('')
    setNewSkillDesc('')
    setCapturedFrames([])
  }

  // حذف مهارة
  const deleteSkill = (id, e) => {
    e.stopPropagation()
    setSkills(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="skill-teaching-panel" style={{
      background: 'rgba(10, 13, 23, 0.96)',
      border: '1px solid #1e293b',
      borderRadius: '12px',
      padding: '14px',
      marginTop: '12px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
    }}>
      {/* ─── شريط التعليم العلوي ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🎓</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              نظام تعليم الروبوت وحفظ المهارات (Skill Teaching &amp; LfD)
              {isRecording && (
                <span style={{
                  background: '#ff3366',
                  color: '#fff',
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontWeight: 'bold',
                  animation: 'pulse 1s infinite'
                }}>
                  ● جاري التسجيل {recordingSeconds}s
                </span>
              )}
            </h3>
            <div style={{ fontSize: '11px', color: '#8899aa' }}>
              حرك جسمك ويديك أمام الكاميرا وسيقوم الروبوت بتعلم المسار واستخلاصه كمهارة قابلة لإعادة التشغيل
            </div>
          </div>
        </div>

        {/* أزرار بدء وإنهاء التسجيل */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {!isRecording ? (
            <button
              onClick={onStartRecording}
              style={{
                background: 'linear-gradient(135deg, #ff3366, #ff6b8b)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 0 16px rgba(255, 51, 102, 0.4)'
              }}
            >
              🔴 ابدأ تعليم الروبوت
            </button>
          ) : (
            <button
              onClick={handleStopAndPromptSave}
              style={{
                background: '#00e5ff',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 0 16px rgba(0, 229, 255, 0.5)'
              }}
            >
              💾 إيقاف وحفظ المهارة ({recordingSeconds}s)
            </button>
          )}
        </div>
      </div>

      {/* ─── مكتبة المهارات المحفوظة ───────────────────────────────────────── */}
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          color: '#8899aa',
          marginBottom: '8px',
          paddingBottom: '4px',
          borderBottom: '1px solid #1e2538'
        }}>
          <span>📚 مكتبة المهارات المحفوظة ({skills.length} مهارات جاهزة للتشغيل)</span>
          <span style={{ fontSize: '11px', color: '#00e5ff' }}>اضغط "▶️ تشغيل" ليقوم الروبوت بتنفيذ الحركة</span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '10px',
          maxHeight: '220px',
          overflowY: 'auto',
          paddingRight: '4px'
        }}>
          {skills.map(skill => {
            const isPlaying = activeReplayId === skill.id

            return (
              <div
                key={skill.id}
                style={{
                  background: isPlaying ? 'rgba(0, 229, 255, 0.15)' : 'rgba(16, 21, 36, 0.85)',
                  border: '1px solid ' + (isPlaying ? '#00e5ff' : '#222b40'),
                  borderRadius: '8px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                  boxShadow: isPlaying ? '0 0 14px rgba(0, 229, 255, 0.3)' : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '13px', color: '#fff' }}>{skill.name}</h4>
                    <span style={{
                      fontSize: '10px',
                      background: skill.category === 'Custom Taught' ? 'rgba(255, 170, 0, 0.2)' : 'rgba(0, 255, 136, 0.2)',
                      color: skill.category === 'Custom Taught' ? '#ffaa00' : '#00ff88',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontWeight: 'bold'
                    }}>
                      {skill.category}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button
                      onClick={() => onReplaySkill(skill)}
                      disabled={isPlaying}
                      style={{
                        background: isPlaying ? '#00ff88' : '#00e5ff',
                        color: '#000',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        cursor: isPlaying ? 'default' : 'pointer'
                      }}
                    >
                      {isPlaying ? '⚡ يُنفَّذ...' : '▶️ تشغيل'}
                    </button>

                    {skill.category === 'Custom Taught' && (
                      <button
                        onClick={(e) => deleteSkill(skill.id, e)}
                        title="حذف المهارة"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ff4d4f',
                          cursor: 'pointer',
                          fontSize: '13px',
                          padding: '2px 4px'
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: '11px', color: '#8899aa', lineHeight: 1.4 }}>
                  {skill.description}
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '10px',
                  color: '#64748b',
                  borderTop: '1px solid #1a2233',
                  paddingTop: '4px'
                }}>
                  <span>المدة: {skill.duration}s</span>
                  <span>النقاط: {skill.keyframesCount} Keyframes</span>
                  <span>{skill.created}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── نافذة حفظ المهارة بعد الانتهاء من التسجيل ────────────────────────── */}
      {showSaveModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: '#0d111a',
            border: '1px solid #00e5ff',
            borderRadius: '12px',
            padding: '24px',
            width: '90%',
            maxWidth: '440px',
            boxShadow: '0 0 30px rgba(0, 229, 255, 0.3)'
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#00e5ff' }}>
              💾 حفظ المهارة المستخلصة من العرض البشري
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#8899aa' }}>
              تم استخلاص مسار الحركة الزماني-المكاني بنجاح ({recordingSeconds} ثانية). أدخل اسماً للمهارة لحفظها في مكتبة الروبوت.
            </p>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                اسم المهارة:
              </label>
              <input
                type="text"
                value={newSkillName}
                onChange={e => setNewSkillName(e.target.value)}
                placeholder="مثال: التقاط المكعب ورفعه للأعلى"
                style={{
                  width: '100%',
                  background: '#161d2d',
                  border: '1px solid #2d3748',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                الوصف / الإجراء:
              </label>
              <input
                type="text"
                value={newSkillDesc}
                onChange={e => setNewSkillDesc(e.target.value)}
                placeholder="مثال: حركة ذراع مخصصة تم تعليمها عبر الكاميرا"
                style={{
                  width: '100%',
                  background: '#161d2d',
                  border: '1px solid #2d3748',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowSaveModal(false)}
                style={{
                  background: '#1e293b',
                  color: '#8899aa',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                إلغاء
              </button>
              <button
                onClick={confirmSaveSkill}
                style={{
                  background: 'linear-gradient(135deg, #00e5ff, #0077ff)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                حفظ في مكتبة المهارات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
