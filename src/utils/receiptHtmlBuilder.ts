import { format } from "date-fns";

export function buildReceiptHtml(booking: any) {
  const roomTypeNames = booking.rooms?.map((r: any) => r.roomType?.name || r.roomType).join(", ") || "N/A";
  const servicesList = (booking.addons || []).map((a: any) => ({
    service: a.serviceName || a.name || "Add-on",
    amount: a.total || 0,
    taxAmount: a.taxAmount || 0,
  }));

  const guestName = booking.bookingContact?.name || booking.customerId?.name || booking.customerDetails?.name || "Guest";
  const guestMobile = booking.bookingContact?.mobile || booking.customerId?.phone || booking.customerDetails?.phone || "Not Provided";
  const guestEmail = booking.bookingContact?.email || booking.customerId?.email || booking.customerDetails?.email || "Not Provided";
  const guestAddress = booking.customerId?.address || "Not Provided";
  const noOfGuests = `${booking.totalAdults || booking.adults || 1} Adults${(booking.totalChildren || booking.children) ? ` + ${booking.totalChildren || booking.children} Children` : ''}`;

  const advancePaid = booking.pricingSummary?.paidAmount || booking.advanceAmount || 0;
  const grandTotal = booking.pricingSummary?.grandTotal || 0;
  const balanceDue = booking.pricingSummary?.dueAmount ?? (grandTotal - advancePaid);
  const paymentMode = booking.paymentMode || "Online / UPI";

  const roomCharges = booking.pricingSummary?.roomTotal || 0;
  const roomTaxAmount = (booking.pricingSummary?.taxAmount || 0) - servicesList.reduce((acc: number, s: any) => acc + (s.taxAmount || 0), 0);
  const totalTaxAmount = booking.pricingSummary?.taxAmount || 0;
  const servicesTotal = servicesList.reduce((acc: number, s: any) => acc + s.amount, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);
  };

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Receipt</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        body { margin: 0; padding: 0; background: white; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; }
      </style>
    </head>
    <body>
      <div class="w-[210mm] bg-white text-black p-8 mx-auto relative text-xs">
        <!-- Header section -->
        <div class="flex justify-between items-center mb-2">
          <div class="w-24 h-24 border border-gray-300 flex items-center justify-center rounded-lg bg-gray-50 text-gray-400">
            LOGO
          </div>
          <div class="flex-1 text-center px-4">
            <h1 class="text-4xl font-bold text-[#0b1b3d] tracking-wider mb-2">SIDDHARAJ RESORT</h1>
            <div class="flex items-center justify-center text-gray-700 mb-1 gap-1">
              <span>📍</span>
              <span>Bataigol, Neora Majhiali, Mal Bazar, West Bengal - 735221</span>
            </div>
            <p class="text-[#a47e3c] font-semibold text-[10px] mb-1">A UNIT OF SIDDHARAJ ESTATE AND HOSPITALITY PRIVATE LIMITED</p>
            <p class="text-gray-600 text-[10px]">CIN - U45400WB2015PTC207217</p>
          </div>
          <div class="w-24 flex flex-col items-center">
            <div class="w-20 h-20 border border-gray-300 flex items-center justify-center bg-gray-50 text-gray-400 mb-1">QR</div>
            <span class="text-[8px] font-bold">SCAN FOR LOCATION</span>
          </div>
        </div>

        <div class="flex justify-between items-center text-[10px] text-gray-800 pb-2 border-b-2 border-[#a47e3c] mb-6 px-4">
          <div class="flex items-center gap-1">📞 +91 9147368813 / 9062558303</div>
          <div class="flex items-center gap-1">✉️ siddharajresortmalbazar@gmail.com</div>
          <div class="flex items-center gap-1">🌐 https://siddharajhotelandresort.com/</div>
        </div>

        <!-- Top Header / Bar -->
        <div class="border border-gray-300 rounded-lg p-2.5 mb-6 flex justify-between items-center bg-gray-50/50">
          <h2 class="text-lg font-bold text-[#0b1b3d] tracking-wide m-0 px-2">BOOKING CONFIRMATION</h2>
          <div class="flex items-center gap-6 pr-2">
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Booking ID:</span>
              <span class="font-bold text-sm">${booking.bookingId || booking.reservationNumber || booking._id?.substring(0, 8)}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Booking Date:</span>
              <span class="font-bold text-sm">${booking.createdAt ? format(new Date(booking.createdAt), "dd MMM yyyy") : format(new Date(), "dd MMM yyyy")}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="border border-green-500 text-green-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px]">
                ${booking.status || "CONFIRMED"}
              </span>
            </div>
          </div>
        </div>

        <!-- Guest & Stay Details Grid -->
        <div class="grid grid-cols-2 gap-4 mb-6">
          <!-- Guest Details -->
          <div class="border border-gray-300 rounded-lg overflow-hidden">
            <div class="bg-[#0b1b3d] text-white px-3 py-2 flex items-center gap-2 font-semibold">
              <span>👤</span> GUEST DETAILS
            </div>
            <div class="p-3 space-y-2">
              <div class="flex"><span class="w-28 text-gray-600">Guest Name</span><span class="w-4">:</span><span class="font-bold text-gray-900 flex-1">${guestName}</span></div>
              <div class="flex"><span class="w-28 text-gray-600">Mobile Number</span><span class="w-4">:</span><span class="font-bold text-gray-900 flex-1">${guestMobile}</span></div>
              <div class="flex"><span class="w-28 text-gray-600">Email ID</span><span class="w-4">:</span><span class="font-bold text-gray-900 flex-1">${guestEmail}</span></div>
              <div class="flex"><span class="w-28 text-gray-600">Address</span><span class="w-4">:</span><span class="font-bold text-gray-900 flex-1">${guestAddress}</span></div>
              <div class="flex"><span class="w-28 text-gray-600">No. of Guests</span><span class="w-4">:</span><span class="font-bold text-gray-900 flex-1">${noOfGuests}</span></div>
              <div class="flex"><span class="w-28 text-gray-600">ID Proof Type</span><span class="w-4">:</span><span class="font-bold text-gray-900 flex-1">Not Provided</span></div>
            </div>
          </div>

          <!-- Stay Details -->
          <div class="border border-gray-300 rounded-lg overflow-hidden">
            <div class="bg-[#0b1b3d] text-white px-3 py-2 flex items-center gap-2 font-semibold">
              <span>📅</span> STAY DETAILS
            </div>
            <div class="p-3 space-y-2">
              <div class="flex"><span class="w-28 text-gray-600">Room Type</span><span class="w-4">:</span><span class="font-bold text-gray-900 flex-1">${roomTypeNames}</span></div>
              <div class="flex"><span class="w-28 text-gray-600">Check-in Date</span><span class="w-4">:</span><span class="font-bold text-gray-900 flex-1">${booking.overallCheckInDate ? format(new Date(booking.overallCheckInDate), "dd MMM yyyy") : "N/A"}</span></div>
              <div class="flex"><span class="w-28 text-gray-600">Check-out Date</span><span class="w-4">:</span><span class="font-bold text-gray-900 flex-1">${booking.overallCheckOutDate ? format(new Date(booking.overallCheckOutDate), "dd MMM yyyy") : "N/A"}</span></div>
              <div class="flex"><span class="w-28 text-gray-600">No. of Nights</span><span class="w-4">:</span><span class="font-bold text-gray-900 flex-1">${booking.totalNights || 1} Nights</span></div>
              <div class="flex"><span class="w-28 text-gray-600">View</span><span class="w-4">:</span><span class="font-bold text-gray-900 flex-1">Standard View</span></div>
              <div class="flex"><span class="w-28 text-gray-600">District</span><span class="w-4">:</span><span class="font-bold text-gray-900 flex-1">Jalpaiguri</span></div>
            </div>
          </div>
        </div>

        <!-- Payment Summary -->
        <div class="border border-gray-300 rounded-lg overflow-hidden mb-6">
          <div class="bg-[#0b1b3d] text-white px-3 py-2 flex items-center gap-2 font-semibold">
            <span>💳</span> PAYMENT SUMMARY
          </div>
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-300 text-[10px] text-gray-600 uppercase">
                <th class="px-3 py-2 font-bold w-1/2">DESCRIPTION</th>
                <th class="px-3 py-2 font-bold text-right">AMOUNT (₹)</th>
                <th class="px-3 py-2 font-bold text-right">TAX (GST) (₹)</th>
                <th class="px-3 py-2 font-bold text-right">TOTAL (₹)</th>
              </tr>
            </thead>
            <tbody class="text-gray-900">
              <tr class="border-b border-gray-200">
                <td class="px-3 py-2">Room Charges (₹${((booking.pricingSummary?.roomTotal || 0) / (booking.totalNights || 1)).toFixed(2)} × ${booking.totalNights || 1} Nights)</td>
                <td class="px-3 py-2 text-right">${formatCurrency(roomCharges)}</td>
                <td class="px-3 py-2 text-right">${formatCurrency(roomTaxAmount)}</td>
                <td class="px-3 py-2 text-right">${formatCurrency(roomCharges + roomTaxAmount)}</td>
              </tr>
              ${servicesList.map((s: any) => `
                <tr class="border-b border-gray-200">
                  <td class="px-3 py-2">${s.service}</td>
                  <td class="px-3 py-2 text-right">${formatCurrency(s.amount)}</td>
                  <td class="px-3 py-2 text-right">${formatCurrency(s.taxAmount)}</td>
                  <td class="px-3 py-2 text-right">${formatCurrency(s.amount + s.taxAmount)}</td>
                </tr>
              `).join('')}
              <tr class="bg-[#fdf8f0] font-bold text-[11px]">
                <td class="px-3 py-2 uppercase">GRAND TOTAL</td>
                <td class="px-3 py-2 text-right">${formatCurrency(roomCharges + servicesTotal)}</td>
                <td class="px-3 py-2 text-right">${formatCurrency(totalTaxAmount)}</td>
                <td class="px-3 py-2 text-right">${formatCurrency(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Payment Breakdown Cards -->
        <div class="grid grid-cols-3 gap-4 mb-6">
          <div class="border border-gray-300 rounded-lg p-3 flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xl">₹</div>
            <div>
              <p class="text-[10px] text-gray-500 font-bold uppercase mb-0.5">ADVANCE PAID</p>
              <p class="font-bold text-sm">₹ ${formatCurrency(advancePaid)}</p>
            </div>
          </div>
          <div class="border border-gray-300 rounded-lg p-3 flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-orange-100 text-orange-500 flex items-center justify-center text-xl">💳</div>
            <div>
              <p class="text-[10px] text-gray-500 font-bold uppercase mb-0.5">BALANCE DUE</p>
              <p class="font-bold text-sm">₹ ${formatCurrency(balanceDue)}</p>
            </div>
          </div>
          <div class="border border-gray-300 rounded-lg p-3 flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center text-xl">🏧</div>
            <div>
              <p class="text-[10px] text-gray-500 font-bold uppercase mb-0.5">PAYMENT MODE</p>
              <p class="font-bold text-sm">${paymentMode}</p>
            </div>
          </div>
        </div>

        <!-- Important Notes -->
        <div class="border border-gray-300 rounded-lg overflow-hidden mb-8">
          <div class="bg-[#0b1b3d] text-white px-3 py-2 flex items-center gap-2 font-semibold">
            <span>📋</span> IMPORTANT NOTES
          </div>
          <div class="p-3 text-[10px] text-gray-700 leading-relaxed">
            <ul class="list-disc pl-4 space-y-1">
              <li>Rooms are subject to availability at the time of check-in.</li>
              <li>Amount once paid may not be refundable as per hotel policy.</li>
              <li>For any issue or dispute, please contact hotel management immediately.</li>
            </ul>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}
