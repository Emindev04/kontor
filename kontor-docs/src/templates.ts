export type Template = { id: string; label: string; html: string }

const today = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

export const TEMPLATES: Template[] = [
  { id: 'blank', label: 'Blank document', html: '<p></p>' },
  {
    id: 'letter',
    label: 'Business letter',
    html: `
      <p>Your Name<br>Street Address<br>City, ST ZIP Code</p>
      <p>${today()}</p>
      <p>Recipient Name<br>Title<br>Company Name<br>Street Address<br>City, ST ZIP Code</p>
      <p>Dear Recipient Name:</p>
      <p>Type the body of your letter here. Keep it short and to the point, and use one paragraph for each idea.</p>
      <p>Thank you for your time and consideration.</p>
      <p>Sincerely,</p>
      <p></p>
      <p>Your Name</p>`,
  },
  {
    id: 'report',
    label: 'Report',
    html: `
      <p data-style="title">Report Title</p>
      <p data-style="subtitle">Author · ${today()}</p>
      <h1>Summary</h1>
      <p>Summarize the most important findings in a few sentences.</p>
      <h1>Background</h1>
      <p>Describe the situation that led to this report.</p>
      <h2>Findings</h2>
      <ul><li><p>First finding</p></li><li><p>Second finding</p></li></ul>
      <h2>Next steps</h2>
      <ol><li><p>Step one</p></li><li><p>Step two</p></li></ol>`,
  },
  {
    id: 'resume',
    label: 'Resume',
    html: `
      <p data-style="title">Your Name</p>
      <p>Street Address · City, ST ZIP · Phone · Email</p>
      <h1>Objective</h1>
      <p>Describe the position you are looking for and what you bring to it.</p>
      <h1>Experience</h1>
      <h2>Job Title · Company · Dates</h2>
      <p>Summarize your key responsibilities, leadership and most stellar accomplishments.</p>
      <h1>Education</h1>
      <h2>Degree · School · Year</h2>
      <p>Mention relevant coursework, awards and honors.</p>
      <h1>Skills</h1>
      <ul><li><p>Skill one</p></li><li><p>Skill two</p></li></ul>`,
  },
  {
    id: 'notes',
    label: 'Meeting notes',
    html: `
      <p data-style="title">Meeting Notes</p>
      <p data-style="subtitle">${today()}</p>
      <h1>Attendees</h1>
      <p>Names of the people who attended.</p>
      <h1>Agenda</h1>
      <ol><li><p>First topic</p></li><li><p>Second topic</p></li></ol>
      <h1>Action items</h1>
      <ul><li><p>Owner – task – due date</p></li></ul>`,
  },
]
