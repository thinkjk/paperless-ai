#!/bin/bash

# Script to import comprehensive document types and tags into paperless-ngx
# Load environment variables if .env exists
if [ -f .env ]; then
    source .env
fi

# Check if required variables are set
if [ -z "$PAPERLESS_API_URL" ] || [ -z "$PAPERLESS_API_TOKEN" ]; then
    echo "Error: PAPERLESS_API_URL and PAPERLESS_API_TOKEN must be set"
    echo "Either create a .env file or set them as environment variables"
    echo ""
    echo "Usage:"
    echo "  PAPERLESS_API_URL=https://your-server/api PAPERLESS_API_TOKEN=your-token ./import-tags-and-types.sh"
    exit 1
fi

echo "Starting import of document types and tags..."
echo "Connecting to: $PAPERLESS_API_URL"
echo ""

# Document Types array
document_types=(
    # Financial
    "Invoice" "Receipt" "Bank Statement" "Credit Card Statement" "Investment Statement"
    "Tax Return" "Tax Assessment" "Pay Stub" "Loan Agreement" "Mortgage Document"
    "Insurance Policy" "Insurance Claim" "Donation Receipt" "Expense Report"
    "Financial Statement" "Budget Document" "Pension Document"

    # Legal
    "Contract" "Agreement" "Court Document" "Legal Notice" "Power of Attorney"
    "Will" "Trust Document" "Settlement Agreement" "Lease Agreement"
    "Non-Disclosure Agreement" "Terms of Service"

    # Government & Official
    "Birth Certificate" "Marriage Certificate" "Death Certificate" "Divorce Decree"
    "Passport" "Driver's License" "ID Card" "Visa" "Immigration Document"
    "Social Security Document" "Voter Registration" "Permit" "License"
    "Government Notice" "Tax Form" "Census Document"

    # Medical & Health
    "Medical Record" "Test Result" "Prescription" "Vaccination Record"
    "Health Insurance Card" "Medical Bill" "Referral" "Treatment Plan"
    "Discharge Summary" "Dental Record" "Vision Prescription" "Mental Health Record"

    # Property & Real Estate
    "Property Deed" "Title Document" "Appraisal" "Inspection Report"
    "HOA Document" "Utility Bill" "Property Tax Statement" "Renovation Document"
    "Floor Plan" "Zoning Document"

    # Vehicle
    "Vehicle Registration" "Vehicle Title" "Vehicle Insurance" "Service Record"
    "Repair Receipt" "Emissions Test" "DMV Document" "Purchase Agreement"

    # Education
    "Diploma" "Certificate" "Transcript" "Report Card" "Enrollment Document"
    "Student Loan Document" "Scholarship Document" "Course Material" "Thesis"

    # Employment
    "Employment Contract" "Offer Letter" "Performance Review" "Resume"
    "Reference Letter" "Termination Letter" "Benefits Document"
    "Stock Option Document" "Non-Compete Agreement"

    # Travel
    "Booking Confirmation" "Itinerary" "Travel Insurance" "Hotel Receipt"
    "Flight Ticket" "Travel Visa" "Vaccination Certificate"

    # Business
    "Business License" "Articles of Incorporation" "Operating Agreement"
    "Business Plan" "Partnership Agreement" "Meeting Minutes" "Business Insurance"
    "Trademark Document" "Patent Document"

    # Correspondence
    "Letter" "Email" "Memo" "Notice" "Announcement" "Newsletter"

    # Consumer & Purchases
    "Warranty" "Product Registration" "Return Policy" "Gift Receipt"
    "Membership Document" "Subscription Agreement"

    # Reference
    "Manual" "Guide" "Specification Sheet" "Brochure" "Catalog" "Map" "Chart"

    # Personal
    "Personal Letter" "Diary Entry" "Photo Album Documentation" "Family Record"
    "Genealogy Document" "Pet Record"
)

# Tags array
tags=(
    # Life Domains
    "Personal" "Business" "Family" "Medical" "Financial" "Legal" "Education"
    "Property" "Vehicle" "Travel"

    # Subject Areas
    "Banking" "Insurance" "Retirement" "Investment" "Real Estate" "Healthcare"
    "Dental" "Vision" "Employment" "Taxes" "Utilities" "Automotive" "Government"
    "Immigration"

    # Classification
    "Confidential" "Important" "Reference" "Historical" "Permanent" "Temporary"
    "Original" "Copy" "Draft" "Final"

    # Relationship
    "Self" "Spouse" "Child" "Parent" "Dependent" "Business Partner" "Tenant"
    "Landlord"

    # Financial Categories
    "Income" "Expense" "Asset" "Liability" "Tax Deductible" "Reimbursable"
    "Charitable" "Investment"

    # Purpose
    "Record Keeping" "Compliance" "Tax Filing" "Insurance Claim" "Legal Proof"
    "Application" "Renewal" "Cancellation"

    # Specific Topics
    "Home Improvement" "Student Loans" "Mortgage" "Retirement Account"
    "Health Savings Account" "Emergency" "Subscription" "Membership"
    "Professional Development" "Certification" "Estate Planning" "Pet Care"

    # Product/Equipment (for manuals and such)
    "Appliance" "Electronics" "Computer" "Phone/Mobile" "Camera" "Audio/Video"
    "Kitchen Equipment" "HVAC" "Power Tool" "Garden Equipment" "Home Security"
    "Networking" "Software" "Game Console" "Smart Home" "Furniture"
    "Exercise Equipment" "Musical Instrument"
)

# Function to create document type
create_document_type() {
    local name="$1"
    local response=$(curl -s -w "\n%{http_code}" -X POST "${PAPERLESS_API_URL}/document_types/" \
        -H "Authorization: Token ${PAPERLESS_API_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"$name\", \"matching_algorithm\": 6, \"match\": \"\", \"is_insensitive\": true}")

    local http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" == "201" ]; then
        echo "✓ Created document type: $name"
    elif [ "$http_code" == "400" ]; then
        echo "- Document type already exists: $name"
    else
        echo "✗ Error creating document type: $name (HTTP $http_code)"
    fi

    sleep 0.1
}

# Function to create tag
create_tag() {
    local name="$1"
    local response=$(curl -s -w "\n%{http_code}" -X POST "${PAPERLESS_API_URL}/tags/" \
        -H "Authorization: Token ${PAPERLESS_API_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"$name\", \"matching_algorithm\": 6, \"match\": \"\", \"is_insensitive\": true}")

    local http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" == "201" ]; then
        echo "✓ Created tag: $name"
    elif [ "$http_code" == "400" ]; then
        echo "- Tag already exists: $name"
    else
        echo "✗ Error creating tag: $name (HTTP $http_code)"
    fi

    sleep 0.1
}

# Create document types
echo "=== Creating ${#document_types[@]} Document Types ==="
for doc_type in "${document_types[@]}"; do
    create_document_type "$doc_type"
done

echo ""
echo "=== Creating ${#tags[@]} Tags ==="
for tag in "${tags[@]}"; do
    create_tag "$tag"
done

echo ""
echo "=== Import Complete ==="
echo "Document Types: ${#document_types[@]}"
echo "Tags: ${#tags[@]}"
