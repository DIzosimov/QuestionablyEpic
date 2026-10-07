import React from "react";
import { Typography } from "@mui/material";
import { reportConditions } from "./UpgradeFinderEngine";

/**
 * The conditions a report was run under, printed on the report itself.
 *
 * WoWAudit accepts a report only if it was generated a particular way, and a number on a page is no evidence of
 * how it was produced. Listing the conditions turns "run it with the right settings" into something that can be
 * checked after the fact - by whoever is submitting it, and by whoever is reading it.
 *
 * Renders nothing at all for an ordinary report, including every report saved before the toggle existed.
 */
export default function ReportConditions({ ufSettings }: { ufSettings?: any }) {
  const conditions = reportConditions(ufSettings);
  if (conditions.length === 0) return null;


  return (
    <div
      style={{
        border: "1px solid #5a5a5a",
        borderRadius: 4,
        backgroundColor: "rgba(28, 28, 28, 0.6)",
        padding: "8px 12px",
        margin: "0px 0px 8px 0px",
      }}
    >
      <Typography variant="subtitle2" style={{ color: "#F2BF59" }}>
        Run under WoWAudit conditions
      </Typography>
      <table style={{ borderCollapse: "collapse", marginTop: 4 }}>
        <tbody>
          {conditions.map((entry: any) => (
            <tr key={entry.condition}>
              <td style={{ padding: "1px 12px 1px 0px", verticalAlign: "top" }}>
                <Typography variant="caption" color="textSecondary">
                  {entry.condition}
                </Typography>
              </td>
              <td style={{ padding: "1px 0px" }}>
                <Typography variant="caption">{entry.value}</Typography>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
