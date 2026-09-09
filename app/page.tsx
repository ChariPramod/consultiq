import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  AudioLines,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Layers3,
  LockKeyhole,
  MessageSquareText,
  Quote,
  ScanText,
  ShieldCheck,
} from 'lucide-react';
import './marketing.css';

export default function Landing() {
  return (
    <div className="marketing">
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <header className="marketing-header">
        <Link href="/" className="marketing-logo" aria-label="ConsultIQ home">
          <AudioLines size={27} />
          <span>
            Consult<span>IQ</span>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#workflow">How it works</a>
          <a href="#product">Product</a>
          <a href="#principles">Our approach</a>
        </nav>
        <Link href="/workspace" className="marketing-login">
          Open workspace <ArrowUp />
        </Link>
      </header>
      <main id="content">
        <section className="marketing-hero">
          <div className="hero-copy">
            <div className="marketing-kicker">
              <span /> CONSULTATION INTELLIGENCE
            </div>
            <h1>
              Better coaching
              <br />
              starts with the
              <br />
              <span>conversation.</span>
            </h1>
            <p>
              A considered workspace for reviewing consultations, understanding
              what happened, and giving your team a clear next step.
            </p>
            <div className="hero-actions">
              <Link href="/workspace" className="marketing-primary">
                Enter your workspace <ArrowRight size={17} />
              </Link>
              <a href="#workflow" className="marketing-secondary">
                Explore the workflow <ArrowDown size={15} />
              </a>
            </div>
            <div className="hero-footnote">
              <LockKeyhole size={14} /> Private pilot · Built for treatment
              coordination
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-caption">
              <span className="visual-caption-line" /> FROM CONVERSATION TO
              CLARITY
            </div>
            <div className="product-window">
              <div className="window-top">
                <div className="window-dots">
                  <i />
                  <i />
                  <i />
                </div>
                <span>Consultation review</span>
                <LockKeyhole size={12} />
              </div>
              <div className="window-content">
                <div className="window-breadcrumb">
                  CONSULTATIONS <ChevronRight size={11} /> REVIEW
                </div>
                <div className="window-title">
                  <h2>
                    A closer look at
                    <br />
                    the next step.
                  </h2>
                  <span>
                    <ClipboardCheck size={18} />
                  </span>
                </div>
                <div className="window-tabs">
                  <span>Transcript</span>
                  <span>Assessment</span>
                  <span>History</span>
                </div>
                <div className="transcript-illustration">
                  <span className="illustration-label">
                    ILLUSTRATIVE TRANSCRIPT
                  </span>
                  <div className="illustration-speaker">
                    <span>P</span>
                    <strong>Patient</strong>
                  </div>
                  <p>“I’d like some time to think about it.”</p>
                  <div className="illustration-speaker coordinator">
                    <span>TC</span>
                    <strong>Coordinator</strong>
                  </div>
                  <div className="highlighted-excerpt">
                    “Of course. Would Thursday afternoon work for a follow-up?”
                    <span>
                      <ScanText size={13} /> Source excerpt
                    </span>
                  </div>
                </div>
                <div className="window-bottom">
                  <span>
                    <CheckCheck size={14} /> Evidence attached to the review
                  </span>
                  <span>Follow-up commitment</span>
                </div>
              </div>
            </div>
            <div className="floating-note">
              <div className="note-icon">
                <MessageSquareText size={20} />
              </div>
              <div>
                <span>COACHING FOCUS</span>
                <strong>Make the next step specific.</strong>
                <p>A clear time. A named owner. A shared plan.</p>
              </div>
            </div>
          </div>
        </section>
        <section className="value-strip" aria-label="Product principles">
          <span>
            Built for thoughtful
            <br />
            <strong>consultation teams.</strong>
          </span>
          <div>
            <ScanText size={23} />
            <strong>Evidence, in context</strong>
          </div>
          <div>
            <Layers3 size={23} />
            <strong>Your standard, consistently</strong>
          </div>
          <div>
            <BookOpen size={23} />
            <strong>Knowledge that stays useful</strong>
          </div>
        </section>
        <section id="workflow" className="marketing-section workflow-section">
          <div className="section-heading">
            <div>
              <span className="marketing-kicker">A CLEARER REVIEW PROCESS</span>
              <h2>
                From a conversation
                <br />
                to a useful coaching moment.
              </h2>
            </div>
            <p>
              Keep the transcript, the assessment, and the next action together.
              Give every review a clear source of truth.
            </p>
          </div>
          <div className="workflow-cards">
            {[
              {
                step: '01',
                icon: FileText,
                title: 'Bring in the conversation',
                text: 'Import a speaker-labeled transcript. Organize it by coordinator and consultation, with a record you can return to.',
              },
              {
                step: '02',
                icon: ScanText,
                title: 'Review with evidence',
                text: 'Assess observable behaviors against your rubric. Attach the exact words behind each score and preserve your review history.',
              },
              {
                step: '03',
                icon: MessageSquareText,
                title: 'Make coaching specific',
                text: 'Use approved guidance to frame the next step. Give feedback that connects directly to what was said.',
              },
            ].map(({ step, icon: Icon, title, text }) => (
              <article key={step}>
                <div className="workflow-card-top">
                  <span>{step}</span>
                  <Icon size={23} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="product" className="marketing-section product-section">
          <div className="section-heading">
            <div>
              <span className="marketing-kicker">
                THE DETAILS MAKE THE DIFFERENCE
              </span>
              <h2>
                A shared standard.
                <br />
                Room for human judgment.
              </h2>
            </div>
            <p>
              Build a review practice your team can understand, question, and
              improve.
            </p>
          </div>
          <div className="product-feature-grid">
            <article className="feature-evidence">
              <div className="feature-icon">
                <Quote size={21} />
              </div>
              <h3>Keep the evidence close.</h3>
              <p>
                A score should lead back to the conversation. Select a
                transcript turn, attach a source excerpt, and make the
                assessment reviewable.
              </p>
              <div className="evidence-visual">
                <span>REVIEW TRAIL</span>
                <div>
                  <span className="evidence-step-icon">
                    <FileText size={16} />
                  </span>
                  <strong>Original transcript</strong>
                  <Check size={15} />
                </div>
                <i />
                <div>
                  <span className="evidence-step-icon">
                    <ScanText size={16} />
                  </span>
                  <strong>Supporting excerpt</strong>
                  <Check size={15} />
                </div>
                <i />
                <div>
                  <span className="evidence-step-icon">
                    <ClipboardCheck size={16} />
                  </span>
                  <strong>Reviewer assessment</strong>
                  <Check size={15} />
                </div>
              </div>
            </article>
            <article className="feature-rubric">
              <div className="feature-icon">
                <Layers3 size={21} />
              </div>
              <h3>Your rubric. Clearly defined.</h3>
              <p>
                Define the anchors your team uses. Publish a version and keep
                existing assessments tied to the standard used at the time.
              </p>
              <div className="rubric-visual">
                {[
                  'Needs discovery',
                  'Presentation clarity',
                  'Objection response',
                  'Follow-up commitment',
                ].map((name, i) => (
                  <div key={name}>
                    <span>0{i + 1}</span>
                    <strong>{name}</strong>
                    <ChevronRight size={14} />
                  </div>
                ))}
              </div>
            </article>
            <article className="feature-library">
              <div className="feature-icon">
                <BookOpen size={21} />
              </div>
              <h3>Put your playbook to work.</h3>
              <p>
                Keep approved training material in a private library. Find
                relevant passages and ground coaching suggestions in documented
                guidance.
              </p>
              <div className="library-visual">
                <div>
                  <FileText size={17} />
                  <span>Consultation playbook</span>
                  <span className="approved-label">Approved</span>
                </div>
                <div>
                  <FileText size={17} />
                  <span>Follow-up guidelines</span>
                  <span className="approved-label">Approved</span>
                </div>
                <div className="library-caption">
                  <ShieldCheck size={14} /> Knowledge with a traceable source
                </div>
              </div>
            </article>
          </div>
        </section>
        <section id="principles" className="principles-section">
          <div>
            <span className="marketing-kicker">BUILT WITH CARE</span>
            <h2>
              Trust comes from
              <br />
              being able to look closer.
            </h2>
            <p>
              ConsultIQ supports professional judgment with a transparent review
              process.
            </p>
          </div>
          <div className="principles-list">
            <article>
              <span>01</span>
              <div>
                <h3>Evidence before confidence</h3>
                <p>
                  Unsupported assessments stay visible. A missing source should
                  never become a convincing score.
                </p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>A record of what changed</h3>
                <p>
                  Keep rubric versions and assessment history so a correction
                  adds context without erasing the original.
                </p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>A defined pilot scope</h3>
                <p>
                  Start with synthetic and role-play transcripts. Audio
                  transcription and real patient data workflows require
                  additional onboarding and validation.
                </p>
              </div>
            </article>
          </div>
        </section>
        <section className="marketing-cta">
          <div>
            <span className="marketing-kicker">MAKE THE NEXT REVIEW COUNT</span>
            <h2>Start with one conversation.</h2>
            <p>
              Bring a transcript. Define your standard. Make the feedback
              useful.
            </p>
          </div>
          <Link href="/workspace" className="marketing-primary">
            Open your workspace <ArrowRight size={18} />
          </Link>
        </section>
      </main>
      <footer className="marketing-footer">
        <Link href="/" className="marketing-logo">
          <AudioLines size={23} />
          <span>
            Consult<span>IQ</span>
          </span>
        </Link>
        <span>Consultation intelligence, with evidence.</span>
        <div>
          <a href="#principles">Our approach</a>
          <Link href="/workspace">
            Workspace <ArrowUp />
          </Link>
        </div>
      </footer>
    </div>
  );
}
function ArrowUp() {
  return <ArrowRight size={16} style={{ transform: 'rotate(-40deg)' }} />;
}
