import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import { ListGroup } from "./list-group";
import { ServerRow } from "./server-row";

describe("ServerRow", () => {
  it("shows the host without scheme plus the note, and fires onPress", () => {
    const onPress = jest.fn();
    render(
      <StaccatoThemeProvider>
        <ListGroup>
          <ServerRow
            url="https://music.home.arpa"
            note="Last used yesterday"
            onPress={onPress}
            isLast
          />
        </ListGroup>
      </StaccatoThemeProvider>,
    );
    expect(screen.getByText("music.home.arpa")).toBeOnTheScreen();
    expect(screen.getByText("Last used yesterday")).toBeOnTheScreen();
    fireEvent.press(screen.getByText("music.home.arpa"));
    expect(onPress).toHaveBeenCalled();
  });
});
