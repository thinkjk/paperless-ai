// Script to import comprehensive document types and tags into paperless-ngx
const axios = require('axios');
require('dotenv').config();

// Create axios client
const client = axios.create({
  baseURL: process.env.PAPERLESS_API_URL,
  headers: {
    'Authorization': `Token ${process.env.PAPERLESS_API_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Document Types to create
const documentTypes = [
  // Financial
  'Invoice', 'Receipt', 'Bank Statement', 'Credit Card Statement', 'Investment Statement',
  'Tax Return', 'Tax Assessment', 'Pay Stub', 'Loan Agreement', 'Mortgage Document',
  'Insurance Policy', 'Insurance Claim', 'Donation Receipt', 'Expense Report',
  'Financial Statement', 'Budget Document', 'Pension Document',

  // Legal
  'Contract', 'Agreement', 'Court Document', 'Legal Notice', 'Power of Attorney',
  'Will', 'Trust Document', 'Settlement Agreement', 'Lease Agreement',
  'Non-Disclosure Agreement', 'Terms of Service',

  // Government & Official
  'Birth Certificate', 'Marriage Certificate', 'Death Certificate', 'Divorce Decree',
  'Passport', 'Driver\'s License', 'ID Card', 'Visa', 'Immigration Document',
  'Social Security Document', 'Voter Registration', 'Permit', 'License',
  'Government Notice', 'Tax Form', 'Census Document',

  // Medical & Health
  'Medical Record', 'Test Result', 'Prescription', 'Vaccination Record',
  'Health Insurance Card', 'Medical Bill', 'Referral', 'Treatment Plan',
  'Discharge Summary', 'Dental Record', 'Vision Prescription', 'Mental Health Record',

  // Property & Real Estate
  'Property Deed', 'Title Document', 'Appraisal', 'Inspection Report',
  'HOA Document', 'Utility Bill', 'Property Tax Statement', 'Renovation Document',
  'Floor Plan', 'Zoning Document',

  // Vehicle
  'Vehicle Registration', 'Vehicle Title', 'Vehicle Insurance', 'Service Record',
  'Repair Receipt', 'Emissions Test', 'DMV Document', 'Purchase Agreement',

  // Education
  'Diploma', 'Certificate', 'Transcript', 'Report Card', 'Enrollment Document',
  'Student Loan Document', 'Scholarship Document', 'Course Material', 'Thesis',

  // Employment
  'Employment Contract', 'Offer Letter', 'Performance Review', 'Resume',
  'Reference Letter', 'Termination Letter', 'Benefits Document',
  'Stock Option Document', 'Non-Compete Agreement',

  // Travel
  'Booking Confirmation', 'Itinerary', 'Travel Insurance', 'Hotel Receipt',
  'Flight Ticket', 'Travel Visa', 'Vaccination Certificate',

  // Business
  'Business License', 'Articles of Incorporation', 'Operating Agreement',
  'Business Plan', 'Partnership Agreement', 'Meeting Minutes', 'Business Insurance',
  'Trademark Document', 'Patent Document',

  // Correspondence
  'Letter', 'Email', 'Memo', 'Notice', 'Announcement', 'Newsletter',

  // Consumer & Purchases
  'Warranty', 'Product Registration', 'Return Policy', 'Gift Receipt',
  'Membership Document', 'Subscription Agreement',

  // Reference
  'Manual', 'Guide', 'Specification Sheet', 'Brochure', 'Catalog', 'Map', 'Chart',

  // Personal
  'Personal Letter', 'Diary Entry', 'Photo Album Documentation', 'Family Record',
  'Genealogy Document', 'Pet Record'
];

// Tags to create
const tags = [
  // Life Domains
  'Personal', 'Business', 'Family', 'Medical', 'Financial', 'Legal', 'Education',
  'Property', 'Vehicle', 'Travel',

  // Subject Areas
  'Banking', 'Insurance', 'Retirement', 'Investment', 'Real Estate', 'Healthcare',
  'Dental', 'Vision', 'Employment', 'Taxes', 'Utilities', 'Automotive', 'Government',
  'Immigration',

  // Classification
  'Confidential', 'Important', 'Reference', 'Historical', 'Permanent', 'Temporary',
  'Original', 'Copy', 'Draft', 'Final',

  // Relationship
  'Self', 'Spouse', 'Child', 'Parent', 'Dependent', 'Business Partner', 'Tenant',
  'Landlord',

  // Financial Categories
  'Income', 'Expense', 'Asset', 'Liability', 'Tax Deductible', 'Reimbursable',
  'Charitable', 'Investment',

  // Purpose
  'Record Keeping', 'Compliance', 'Tax Filing', 'Insurance Claim', 'Legal Proof',
  'Application', 'Renewal', 'Cancellation',

  // Specific Topics
  'Home Improvement', 'Student Loans', 'Mortgage', 'Retirement Account',
  'Health Savings Account', 'Emergency', 'Subscription', 'Membership',
  'Professional Development', 'Certification', 'Estate Planning', 'Pet Care',

  // Product/Equipment (for manuals and such)
  'Appliance', 'Electronics', 'Computer', 'Phone/Mobile', 'Camera', 'Audio/Video',
  'Kitchen Equipment', 'HVAC', 'Power Tool', 'Garden Equipment', 'Home Security',
  'Networking', 'Software', 'Game Console', 'Smart Home', 'Furniture',
  'Exercise Equipment', 'Musical Instrument'
];

async function createDocumentType(name) {
  try {
    const response = await client.post('/document_types/', {
      name: name,
      matching_algorithm: 6, // 6 = Auto
      match: "",
      is_insensitive: true
    });
    console.log(`✓ Created document type: ${name} (ID: ${response.data.id})`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 400) {
      console.log(`- Document type already exists: ${name}`);
    } else {
      console.error(`✗ Error creating document type "${name}":`, error.response?.data || error.message);
    }
  }
}

async function createTag(name) {
  try {
    const response = await client.post('/tags/', {
      name: name,
      matching_algorithm: 6, // 6 = Auto
      match: "",
      is_insensitive: true
    });
    console.log(`✓ Created tag: ${name} (ID: ${response.data.id})`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 400) {
      console.log(`- Tag already exists: ${name}`);
    } else {
      console.error(`✗ Error creating tag "${name}":`, error.response?.data || error.message);
    }
  }
}

async function main() {
  console.log('Starting import of document types and tags...\n');

  // Check credentials
  if (!process.env.PAPERLESS_API_URL || !process.env.PAPERLESS_API_TOKEN) {
    console.error('Error: PAPERLESS_API_URL and PAPERLESS_API_TOKEN must be set in .env file');
    process.exit(1);
  }

  console.log(`Connecting to: ${process.env.PAPERLESS_API_URL}\n`);

  // Create document types
  console.log(`=== Creating ${documentTypes.length} Document Types ===`);
  for (const docType of documentTypes) {
    await createDocumentType(docType);
    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n=== Creating ${tags.length} Tags ===`);
  for (const tag of tags) {
    await createTag(tag);
    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n=== Import Complete ===');
  console.log(`Document Types: ${documentTypes.length}`);
  console.log(`Tags: ${tags.length}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
