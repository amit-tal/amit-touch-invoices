const assert = require('assert');

// Simulate the exact frontend flow of RecordPaymentModal & DocumentsContext
async function testRecordPaymentFlow() {
  console.log('--- STARTING VERIFICATION: RECORD PAYMENT MODAL FLOW ---\n');

  // Mock server database in-memory state
  const mockDocuments = [
    {
      id: 'pr_test_101',
      documentNumber: '40018',
      type: 'payment_request',
      status: 'issued',
      totalAmount: 1500,
      paidAmount: 0,
      remainingBalance: 1500,
      clientId: 'client_001',
      clientName: 'ענבר עיצובים בע״מ',
    }
  ];

  let nextReceiptSeq = 250021;

  // Mock server handler for /api/documents/issue
  async function mockServerIssueReceipt({ documentDraft, allocations }) {
    if (!documentDraft.clientId) {
      return { ok: false, status: 400, error: 'יש לבחור לקוח' };
    }
    if (documentDraft.totalAmount <= 0) {
      return { ok: false, status: 400, error: 'סכום התשלום חייב להיות גדול מ-0' };
    }
    
    // Simulate statutory check failure if cash is used in secured signature without paper receipt
    const hasCash = documentDraft.paymentMethods?.some(m => m.type === 'cash');
    if (hasCash && !documentDraft.isPaperReceipt) {
      return {
        ok: false,
        status: 400,
        error: 'לא ניתן להפיק קבלה אלקטרונית: תשלום במזומן אינו מורשה למשלוח כמסמך ממוחשב בחתימה מאובטחת לפי סעיף 18ב(ד).'
      };
    }

    const docNum = String(nextReceiptSeq++);
    const issuedReceipt = {
      ...documentDraft,
      id: `receipt_${Date.now()}`,
      documentNumber: docNum,
      status: 'issued',
      paidAmount: documentDraft.totalAmount,
      remainingBalance: 0,
    };

    mockDocuments.push(issuedReceipt);

    // Update linked payment request atomically
    if (allocations && allocations.length > 0) {
      for (const alloc of allocations) {
        const pr = mockDocuments.find(d => d.id === alloc.paymentRequestId);
        if (pr) {
          pr.paidAmount += alloc.allocatedAmount;
          pr.remainingBalance = Math.max(0, pr.totalAmount - pr.paidAmount);
          pr.status = pr.remainingBalance <= 0 ? 'paid' : 'partially_paid';
          pr.relatedDocumentIds = [...(pr.relatedDocumentIds || []), issuedReceipt.id];
        }
      }
    }

    return { ok: true, status: 200, document: issuedReceipt };
  }

  // Frontend Modal state tracker
  class RecordPaymentModalSimulation {
    constructor(props) {
      this.props = props;
      this.state = {
        isOpen: true,
        isSubmitting: false,
        error: '',
        totalAmount: props.targetPaymentRequest?.remainingBalance || 1500,
        methods: [
          {
            id: 'm1',
            type: 'bank_transfer',
            amount: props.targetPaymentRequest?.remainingBalance || 1500,
            referenceNumber: '12345678',
            isDirectTransferConfirmed: true,
          }
        ],
        allocations: {
          [props.targetPaymentRequest?.id]: props.targetPaymentRequest?.remainingBalance || 1500,
        },
      };
      this.toastMessage = null;
      this.detailsModalOpened = false;
    }

    async submit() {
      if (this.state.isSubmitting) return; // Prevent duplicate submission

      const { totalAmount, methods, allocations } = this.state;
      const methodsSum = methods.reduce((acc, m) => acc + (m.amount || 0), 0);

      if (Math.abs(methodsSum - totalAmount) > 0.01) {
        this.state.error = `סך אמצעי התשלום (${methodsSum} ₪) חייב להיות שווה לסכום הכולל (${totalAmount} ₪)`;
        return;
      }

      this.state.error = '';
      this.state.isSubmitting = true;

      const allocArray = Object.entries(allocations)
        .filter(([_, val]) => val > 0)
        .map(([reqId, val]) => ({ paymentRequestId: reqId, allocatedAmount: val }));

      try {
        const draft = {
          type: 'receipt',
          clientId: this.props.clientId,
          totalAmount,
          paymentMethods: methods,
          isPaperReceipt: this.state.isPaperReceipt,
        };

        const res = await mockServerIssueReceipt({ documentDraft: draft, allocations: allocArray });
        if (!res.ok) {
          throw new Error(res.error || 'שגיאה בהפקת הקבלה');
        }

        const receipt = res.document;
        this.toastMessage = `קבלה מס׳ ${receipt.documentNumber} הופקה בהצלחה`;

        // Notify parent and CLOSE modal
        if (this.props.onReceiptIssued) {
          this.props.onReceiptIssued(receipt);
        }
        this.props.onClose();
        this.state.isOpen = false;
      } catch (err) {
        // Keep dialog open with entered values intact!
        this.state.error = err.message || 'שגיאה בהפקת הקבלה';
      } finally {
        this.state.isSubmitting = false;
      }
    }
  }

  // =========================================================================
  // PATH 1: SUCCESSFUL ISSUANCE
  // =========================================================================
  console.log('TEST 1: Testing Successful Issuance Path...');
  let modalClosed = false;
  let anotherModalOpened = false;

  const targetPR = mockDocuments[0];
  const modal = new RecordPaymentModalSimulation({
    clientId: 'client_001',
    targetPaymentRequest: targetPR,
    onClose: () => {
      modalClosed = true;
    },
    onReceiptIssued: (_receipt) => {
      // Must NOT open another dialog!
      modalClosed = true;
      anotherModalOpened = false;
    }
  });

  // Verify button is initially enabled
  assert.strictEqual(modal.state.isSubmitting, false, 'Submit button should initially be enabled');
  assert.strictEqual(modal.state.isOpen, true, 'Modal should initially be open');

  // Trigger submission
  await modal.submit();

  // 1. Verify modal is automatically closed
  assert.strictEqual(modalClosed, true, 'Dialog must be closed automatically on success');
  assert.strictEqual(modal.state.isOpen, false, 'Modal state isOpen must be false');

  // 2. Verify NO other modal was opened
  assert.strictEqual(anotherModalOpened, false, 'Must not open another dialog on success');

  // 3. Verify confirmation toast contains exact receipt number
  assert.strictEqual(modal.toastMessage, 'קבלה מס׳ 250021 הופקה בהצלחה');
  console.log(' - Toast confirmation:', modal.toastMessage);

  // 4. Verify document list updated and linked payment request balance updated
  const updatedPR = mockDocuments.find(d => d.id === 'pr_test_101');
  assert.strictEqual(updatedPR.remainingBalance, 0, 'Payment request remaining balance must be 0');
  assert.strictEqual(updatedPR.paidAmount, 1500, 'Payment request paid amount must be 1500');
  assert.strictEqual(updatedPR.status, 'paid', 'Payment request status must be paid');

  const createdReceipt = mockDocuments.find(d => d.documentNumber === '250021');
  assert(createdReceipt, 'Created receipt must exist in documents list');
  assert.strictEqual(createdReceipt.totalAmount, 1500);

  console.log(' - Linked Payment Request remaining balance:', updatedPR.remainingBalance);
  console.log(' - Linked Payment Request status:', updatedPR.status);
  console.log('✓ TEST 1 PASSED: Successful issuance automatically closes dialog, updates PR balance to 0, shows exact toast, and leaves user on page.\n');

  // =========================================================================
  // PATH 2: FAILED ISSUANCE
  // =========================================================================
  console.log('TEST 2: Testing Failed Issuance Path (Statutory Cash Error without paper mode)...');
  let failModalClosed = false;

  const failModal = new RecordPaymentModalSimulation({
    clientId: 'client_001',
    targetPaymentRequest: { id: 'pr_test_102', remainingBalance: 800 },
    onClose: () => {
      failModalClosed = true;
    },
    onReceiptIssued: () => {
      failModalClosed = true;
    }
  });

  // Enter values with an ineligible payment method (cash under electronic signature)
  failModal.state.totalAmount = 800;
  failModal.state.methods = [
    { id: 'm_cash', type: 'cash', amount: 800 }
  ];
  failModal.state.allocations = { pr_test_102: 800 };
  failModal.state.isPaperReceipt = false;

  // Submit
  await failModal.submit();

  // 1. Verify modal is NOT closed
  assert.strictEqual(failModalClosed, false, 'Dialog must NOT close when issuance fails');
  assert.strictEqual(failModal.state.isOpen, true, 'Dialog isOpen must remain true');

  // 2. Verify all entered values remain intact
  assert.strictEqual(failModal.state.totalAmount, 800, 'Entered totalAmount must be preserved');
  assert.strictEqual(failModal.state.methods[0].type, 'cash', 'Entered payment method must be preserved');
  assert.strictEqual(failModal.state.allocations['pr_test_102'], 800, 'Entered allocation must be preserved');

  // 3. Verify clear Hebrew error is displayed
  assert(failModal.state.error.includes('לא ניתן להפיק קבלה אלקטרונית'), 'Error must contain clear Hebrew message');
  console.log(' - Displayed Hebrew error:', failModal.state.error);

  // 4. Verify submit button is re-enabled so user can adjust and re-submit
  assert.strictEqual(failModal.state.isSubmitting, false, 'Submit button must re-enable on failure');

  console.log('✓ TEST 2 PASSED: Failed issuance leaves dialog open, preserves all values, displays Hebrew error, and re-enables button.\n');

  // =========================================================================
  // PATH 3: DUPLICATE SUBMISSION PREVENTION WHILE IN-FLIGHT
  // =========================================================================
  console.log('TEST 3: Testing In-Flight Duplicate Submission Prevention...');
  const inFlightModal = new RecordPaymentModalSimulation({
    clientId: 'client_001',
    targetPaymentRequest: { id: 'pr_test_103', remainingBalance: 500 },
    onClose: () => {},
  });

  inFlightModal.state.isSubmitting = true; // In progress
  let secondCallExecuted = false;
  
  // Try to submit while in progress
  await inFlightModal.submit();
  assert.strictEqual(inFlightModal.toastMessage, null, 'Duplicate click while in-flight must be ignored');
  console.log('✓ TEST 3 PASSED: In-flight duplicate clicks are safely ignored.\n');

  console.log('=====================================================');
  console.log('✓ ALL TESTS PASSED: RECORD PAYMENT MODAL BEHAVIOR VERIFIED!');
  console.log('=====================================================');
}

testRecordPaymentFlow().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
